import type {
	ChannelProvider,
	GenerateResponseInput,
	PromptSection,
	ToolContext,
} from "@repo/ai";
import {
	buildContextGapNote,
	buildSystemPrompt,
	decryptToken,
	executeEscalationGuard,
	extractToolPromptOverrides,
	formatHistoryMessage,
	generateAgentResponse,
	isWhishMoneyMessage,
	markAsRead,
	parseWebhookPayload,
	resolveTools,
	sendTextMessage,
	sendTypingIndicator,
	sendWhishPaymentEscalation,
	stripToolAnnotation,
	telegram,
	transcribeMessageMedia,
	triageBufferedMessages,
	whatsapp,
} from "@repo/ai";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { getRedisConnection, queueAiChatRetry } from "@repo/jobs";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";
import { uploadBuffer } from "@repo/storage";
import {
	computeBotFingerprint,
	isHumanTakeoverActive,
	trackBotMessage,
} from "./bot-fingerprint";
import { resolveVerifiedCustomerId } from "./resolve-verified-customer";
import { fetchServicePlansSection } from "./service-plans-context";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

const RETRY_MESSAGE = "Give me a moment, I'm still working on this...";

// Concurrency limiter for AI generations in the web server process
let activeGenerations = 0;
const MAX_CONCURRENT_GENERATIONS = 20;

const MIME_TO_EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"audio/ogg": "ogg",
	"audio/mpeg": "mp3",
	"audio/webm": "webm",
	"audio/wav": "wav",
	"video/mp4": "mp4",
	"video/webm": "webm",
	"application/pdf": "pdf",
	"application/ogg": "ogg",
};

function getExtFromMime(contentType: string): string {
	// Strip MIME parameters (e.g. "audio/ogg; codecs=opus" → "audio/ogg")
	const base = contentType.split(";")[0]?.trim() ?? contentType;
	return MIME_TO_EXT[base] ?? base.split("/")[1] ?? "bin";
}
const QUOTA_EXCEEDED_MESSAGE =
	"This agent has reached its message limit. Please contact the organization administrator.";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-check human takeover state by reading the latest `humanTakeoverAt`
 * from the DB. Used at key points during generation to abort AI replies
 * if the admin took over mid-flight (e.g. typed a reply on their phone
 * while a tool-chain generation was still running).
 */
async function isTakeoverActiveFresh(
	conversationId: string,
	humanTakeoverHours: number | null,
): Promise<boolean> {
	if (!humanTakeoverHours) {
		return false;
	}
	const fresh = await db.aiConversation.findUnique({
		where: { id: conversationId },
		select: { humanTakeoverAt: true },
	});
	return isHumanTakeoverActive(
		fresh?.humanTakeoverAt ?? null,
		humanTakeoverHours,
	);
}

async function handleMessages(
	webhookToken: string,
	provider: ChannelProvider,
	body: unknown,
	secretHeader?: string | null,
): Promise<Response> {
	// Look up channel by webhookToken
	const channel = await db.aiAgentChannel.findUnique({
		where: { webhookToken },
		include: {
			agent: true,
		},
	});

	if (!channel || !channel.enabled || !channel.agent.enabled) {
		return new Response("OK", { status: 200 });
	}

	// Telegram: validate secret token header
	if (
		provider === "telegram" &&
		channel.webhookSecret &&
		secretHeader !== channel.webhookSecret
	) {
		return new Response("OK", { status: 200 });
	}

	// Handle Telegram /start command
	if (
		provider === "telegram" &&
		telegram.isStartCommand(body) &&
		channel.agent.greetingMessage
	) {
		const messages = parseWebhookPayload(provider, body);
		if (messages[0]) {
			const apiToken = decryptToken(channel.encryptedApiToken);
			await sendTextMessage(
				provider,
				apiToken,
				messages[0].chatId,
				channel.agent.greetingMessage,
			);
			trackBotMessage(
				getRedisConnection(),
				channel.agent.greetingMessage,
			);
		}
		return new Response("OK", { status: 200 });
	}

	const parsedMessages = parseWebhookPayload(provider, body);
	if (parsedMessages.length === 0) {
		return new Response("OK", { status: 200 });
	}

	const apiToken = decryptToken(channel.encryptedApiToken);

	for (const msg of parsedMessages) {
		try {
			// Handle outgoing (fromMe) messages — an admin replying on their
			// linked phone. We persist these as role="admin" messages so they
			// appear in /conversations, and (if enabled) activate human takeover.
			if (msg.fromMe) {
				// If the message has text, check if it's a bot echo via fingerprint
				if (msg.text) {
					const redis = getRedisConnection();
					const fp = computeBotFingerprint(msg.text);
					const isBotMessage = await redis.get(`ai:bot-fp:${fp}`);

					if (isBotMessage) {
						// Bot echo — clean up and skip
						redis.del(`ai:bot-fp:${fp}`).catch(() => {});
						continue;
					}
				}

				// No text (voice/image/sticker from phone) or text not matching
				// any bot fingerprint → this is a human-sent message.
				// The bot only ever sends text via sendTextMessage(), so any
				// non-text fromMe message is guaranteed to be from a human.

				// Find conversation — handle JID format mismatch by prefix match
				let takeoverConversation = await db.aiConversation.findFirst({
					where: {
						channelId: channel.id,
						status: "active",
						externalChatId: msg.chatId,
					},
					orderBy: { updatedAt: "desc" },
				});
				if (!takeoverConversation) {
					const chatIdBase = msg.chatId.split("@")[0];
					takeoverConversation = await db.aiConversation.findFirst({
						where: {
							channelId: channel.id,
							status: "active",
							externalChatId: {
								startsWith: `${chatIdBase}@`,
							},
						},
						orderBy: { updatedAt: "desc" },
					});
				}

				if (!takeoverConversation) {
					continue;
				}

				// Persist the admin's phone message so it shows in the
				// dashboard conversation view. De-dupe by externalMsgId in
				// case WaSender retries the webhook — check this BEFORE the
				// expensive media transcription so retried deliveries don't
				// re-burn LLM calls.
				if (msg.text) {
					const existing = await db.aiMessage.findFirst({
						where: {
							conversationId: takeoverConversation.id,
							externalMsgId: msg.messageId,
						},
						select: { id: true },
					});
					if (!existing) {
						const adminContent =
							(await transcribeMessageMedia(apiToken, msg)) ??
							msg.text;
						await db.aiMessage.create({
							data: {
								conversationId: takeoverConversation.id,
								role: "admin",
								content: adminContent,
								externalMsgId: msg.messageId,
							},
						});
					}
				}

				// Update conversation: bump lastMessageAt, and activate
				// takeover if the feature is enabled on the agent.
				await db.aiConversation.update({
					where: { id: takeoverConversation.id },
					data: {
						lastMessageAt: new Date(),
						...(channel.agent.humanTakeoverHours
							? { humanTakeoverAt: new Date() }
							: {}),
					},
				});

				if (channel.agent.humanTakeoverHours) {
					logger.info("Human takeover activated", {
						conversationId: takeoverConversation.id,
						chatId: msg.chatId,
					});
				}

				continue;
			}

			// Mark message as read (fire-and-forget)
			markAsRead(provider, apiToken, msg.messageId, msg.chatId).catch(
				() => {},
			);

			// Handle /clear command \u2014 mark conversation as cleared, preserving history
			if (msg.text.trim().toLowerCase() === "/clear") {
				const redis = getRedisConnection();
				const lockKey = `ai:lock:${channel.id}:${msg.chatId}`;
				const bufferKey = `ai:buffer:${channel.id}:${msg.chatId}`;

				// Acquire the processing lock so we don't delete mid-generation
				let clearLockAcquired = false;
				for (let i = 0; i < 5; i++) {
					clearLockAcquired = !!(await redis.set(
						lockKey,
						"clear",
						"EX",
						10,
						"NX",
					));
					if (clearLockAcquired) {
						break;
					}
					await sleep(1000);
				}

				if (!clearLockAcquired) {
					await sendTextMessage(
						provider,
						apiToken,
						msg.chatId,
						"Please wait for the current response to finish, then try /clear again.",
					);
					trackBotMessage(
						redis,
						"Please wait for the current response to finish, then try /clear again.",
					);
					continue;
				}

				try {
					// Drain any buffered messages
					await redis.del(bufferKey);

					await db.aiConversation.updateMany({
						where: {
							channelId: channel.id,
							externalChatId: msg.chatId,
							status: "active",
						},
						data: { status: "cleared" },
					});
				} finally {
					await redis.del(lockKey);
				}

				const clearText =
					"Conversation cleared. Send a message to start fresh.";
				await sendTextMessage(
					provider,
					apiToken,
					msg.chatId,
					clearText,
				);
				trackBotMessage(redis, clearText);
				continue;
			}

			let messageText = msg.text;
			if (msg.mediaId && msg.mediaType) {
				// Caption is the cheapest language hint; otherwise borrow the
				// last user message so the transcriber knows which language to
				// expect (it has a strong default of Arabic which is wrong for
				// French/English subscribers).
				let languageHint = msg.mediaCaption;
				if (!languageHint) {
					const lastMsg = await db.aiMessage.findFirst({
						where: {
							conversation: {
								channelId: channel.id,
								externalChatId: msg.chatId,
								status: "active",
							},
							role: "user",
						},
						orderBy: { createdAt: "desc" },
						select: { content: true },
					});
					if (lastMsg?.content) {
						languageHint = lastMsg.content.slice(0, 100);
					}
				}

				const transcribed = await transcribeMessageMedia(
					apiToken,
					msg,
					languageHint ?? undefined,
				);
				if (transcribed) {
					messageText = transcribed;
				}
			}

			// Truncate incoming message
			const truncatedText = messageText.slice(
				0,
				config.ai.maxMessageLength,
			);

			// Find or create active conversation
			let conversation = await db.aiConversation.findFirst({
				where: {
					channelId: channel.id,
					externalChatId: msg.chatId,
					status: "active",
				},
				orderBy: { createdAt: "desc" },
			});
			const previousLastMessageAt = conversation?.lastMessageAt ?? null;
			if (conversation) {
				conversation = await db.aiConversation.update({
					where: { id: conversation.id },
					data: {
						contactName: msg.contactName ?? null,
						lastMessageAt: new Date(),
					},
				});
			} else {
				conversation = await db.aiConversation.create({
					data: {
						agentId: channel.agent.id,
						channelId: channel.id,
						externalChatId: msg.chatId,
						contactName: msg.contactName ?? null,
						contactId: msg.contactId ?? null,
						lastMessageAt: new Date(),
						messageCount: 0,
					},
				});
			}

			// Link the conversation to a customer when we can — saves the agent
			// from re-asking for a phone/username it already has from the
			// messaging provider. Only auto-links on a unique match to avoid
			// guessing on shared family phones.
			if (conversation.contactId && !conversation.verifiedCustomerId) {
				const customerId = await resolveVerifiedCustomerId(
					channel.agent.organizationId,
					conversation.contactId,
				);
				if (customerId) {
					conversation = await db.aiConversation.update({
						where: { id: conversation.id },
						data: { verifiedCustomerId: customerId },
					});
				}
			}

			// Upload incoming media to R2 for display in dashboard
			let attachmentData: Record<string, unknown> = {};
			if (
				msg.mediaType === "location" &&
				msg.latitude != null &&
				msg.longitude != null
			) {
				attachmentData = {
					attachmentType: "location",
					attachmentMeta: { lat: msg.latitude, lng: msg.longitude },
				};
			} else if (msg.mediaId && msg.mediaType) {
				try {
					const media =
						provider === "telegram"
							? await telegram.downloadMedia(
									apiToken,
									msg.mediaId,
								)
							: await whatsapp.downloadMedia(
									apiToken,
									msg.mediaId,
									msg.mediaLink,
								);
					if (media) {
						const { createId } = await import(
							"@paralleldrive/cuid2"
						);
						const ext = getExtFromMime(media.contentType);
						const storagePath = `chat-attachments/${channel.agent.organizationId}/${conversation.id}/${createId()}.${ext}`;
						const bucket =
							process.env["AVATARS_BUCKET_NAME"] ??
							"libancom-dev";
						await uploadBuffer(storagePath, media.buffer, {
							bucket,
							contentType: media.contentType,
						});
						attachmentData = {
							attachmentType: msg.mediaType,
							attachmentUrl: storagePath,
							attachmentFilename: msg.mediaFileName ?? null,
							attachmentMimeType: media.contentType,
							attachmentSize: media.buffer.length,
						};
					}
				} catch (error) {
					logger.error("Failed to upload incoming media to R2", {
						error,
						mediaType: msg.mediaType,
						conversationId: conversation.id,
					});
				}
			}

			// Check if human takeover is active — store message but skip AI response
			if (
				isHumanTakeoverActive(
					conversation.humanTakeoverAt,
					channel.agent.humanTakeoverHours,
				)
			) {
				await db.aiMessage.create({
					data: {
						conversationId: conversation.id,
						role: "user",
						content: truncatedText,
						externalMsgId: msg.messageId,
						...attachmentData,
					} as never,
				});
				continue;
			}
			// Clear expired takeover if present
			if (conversation.humanTakeoverAt) {
				await db.aiConversation.update({
					where: { id: conversation.id },
					data: { humanTakeoverAt: null },
				});
			}

			// Store user message in DB immediately
			await db.aiMessage.create({
				data: {
					conversationId: conversation.id,
					role: "user",
					content: truncatedText,
					externalMsgId: msg.messageId,
					...attachmentData,
				} as never,
			});

			// Detect Whish Money payment notifications — send hardcoded reply, skip AI
			if (isWhishMoneyMessage(truncatedText)) {
				const whishReply =
					"شكراً لإرسال الدفعة! سيتحقق منها المسؤول ويرد عليك قريباً.\nThank you for the payment! The admin will check it and get back to you shortly.";
				await sendTextMessage(
					provider,
					apiToken,
					msg.chatId,
					whishReply,
				);
				trackBotMessage(getRedisConnection(), whishReply);
				await db.aiMessage.create({
					data: {
						conversationId: conversation.id,
						role: "assistant",
						content: whishReply,
					},
				});
				await db.aiConversation.update({
					where: { id: conversation.id },
					data: {
						messageCount: { increment: 2 },
						lastMessageAt: new Date(),
					},
				});

				// Fire-and-forget Telegram escalation so the team sees the payment
				sendWhishPaymentEscalation({
					agentId: channel.agent.id,
					conversationId: conversation.id,
					contactName: msg.contactName ?? null,
					contactPhone: msg.contactId ?? null,
					messageText: truncatedText,
				}).catch(() => {});

				continue;
			}

			// Send typing indicator immediately so user sees activity
			sendTypingIndicator(provider, apiToken, msg.chatId).catch(() => {});

			// Buffer message text and try to acquire processing lock
			const redis = getRedisConnection();
			const bufferKey = `ai:buffer:${channel.id}:${msg.chatId}`;
			const lockKey = `ai:lock:${channel.id}:${msg.chatId}`;

			await redis.rpush(bufferKey, truncatedText);

			// Check concurrency limit before acquiring lock
			if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
				// Message is buffered; an active processor will pick it up
				continue;
			}

			// Acquire lock with unique owner ID for safe renewal + release
			const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const lockAcquired = await redis.set(
				lockKey,
				lockValue,
				"EX",
				120,
				"NX",
			);

			if (!lockAcquired) {
				// Active processor will pick up the buffered message
				continue;
			}

			// Re-check conversation status — it may have changed between
			// the initial lookup and lock acquisition
			const preCheck = await db.aiConversation.findUnique({
				where: { id: conversation.id },
				select: { status: true },
			});
			if (preCheck?.status !== "active") {
				await redis.del(lockKey);
				continue;
			}

			// Resolve tools once (same for all messages in this chat)
			let tools: GenerateResponseInput["tools"];
			const agentToolConfigs =
				channel.agent.enabledTools.length > 0
					? await db.aiAgentToolConfig.findMany({
							where: { agentId: channel.agent.id },
						})
					: [];

			if (channel.agent.enabledTools.length > 0) {
				const perToolConfigs: Record<
					string,
					Record<string, unknown>
				> = {};
				for (const tc of agentToolConfigs) {
					perToolConfigs[tc.toolId] = tc.config as Record<
						string,
						unknown
					>;
				}

				const toolContext: ToolContext = {
					organizationId: channel.agent.organizationId,
					agentId: channel.agent.id,
					conversationId: conversation.id,
					externalChatId: msg.chatId,
					contactName: msg.contactName,
				};
				tools = resolveTools(
					channel.agent.enabledTools,
					toolContext,
					perToolConfigs,
				);
			}

			// Fetch service plans section (if enabled)
			const servicePlans = await fetchServicePlansSection(
				channel.agent.organizationId,
				channel.agent.servicePlansEnabled,
				channel.agent.servicePlanIds,
			);

			// Build system prompt once
			const systemPrompt = buildSystemPrompt({
				basePrompt: channel.agent.systemPrompt,
				enabledTools: channel.agent.enabledTools,
				contactName: msg.contactName ?? undefined,
				contactPhone: msg.contactId ?? undefined,
				maintenanceMode: channel.agent.maintenanceMode,
				maintenanceMessage:
					channel.agent.maintenanceMessage ?? undefined,
				provider,
				servicePlans,
				promptSections: channel.agent
					.promptSections as unknown as PromptSection[],
				toolPromptOverrides:
					extractToolPromptOverrides(agentToolConfigs),
			});

			// Renew lock every 30s to prevent expiry during long generations
			const lockRenewal = setInterval(async () => {
				try {
					const current = await redis.get(lockKey);
					if (current === lockValue) {
						await redis.expire(lockKey, 120);
					}
				} catch {
					// Ignore renewal errors
				}
			}, 30_000);

			// Processing loop \u2014 handles buffered messages + any that arrive during generation
			let isFirstIteration = true;
			let lastAssistantText = "";
			const lastUserMessage = truncatedText;

			activeGenerations++;
			try {
				while (true) {
					// Bail out if conversation was cleared, or if the admin
					// has taken over since the last iteration (e.g. typed
					// a reply on their phone while we were generating).
					const freshState = await db.aiConversation.findUnique({
						where: { id: conversation.id },
						select: { status: true, humanTakeoverAt: true },
					});
					if (freshState?.status !== "active") {
						break;
					}
					if (
						isHumanTakeoverActive(
							freshState.humanTakeoverAt ?? null,
							channel.agent.humanTakeoverHours,
						)
					) {
						logger.info(
							"AI reply loop aborted — human takeover active",
							{ conversationId: conversation.id },
						);
						break;
					}

					// Wait for rapid messages to settle
					await sleep(3000);

					// Atomically drain the buffer
					const multi = redis.multi();
					multi.lrange(bufferKey, 0, -1);
					multi.del(bufferKey);
					const results = await multi.exec();
					const bufferedTexts = (results?.[0]?.[1] ?? []) as string[];

					if (bufferedTexts.length === 0) {
						break;
					}

					// Triage buffered messages on second+ iterations
					if (!isFirstIteration && lastAssistantText) {
						const triageResult = await triageBufferedMessages({
							lastAssistantResponse: lastAssistantText,
							bufferedMessages: bufferedTexts,
							recentUserMessage: lastUserMessage,
						});

						logger.info("Buffer triage result", {
							decision: triageResult.decision,
							bufferedCount: bufferedTexts.length,
							conversationId: conversation.id,
							provider,
						});

						if (triageResult.decision === "skip") {
							// Messages are noise \u2014 update counts but don't generate
							await db.aiConversation.update({
								where: { id: conversation.id },
								data: {
									messageCount: {
										increment: bufferedTexts.length,
									},
									lastMessageAt: new Date(),
								},
							});
							continue;
						}

						if (triageResult.decision === "acknowledge") {
							// Send brief acknowledgment without full generation
							const ackMessage =
								triageResult.message ??
								"Understood, let me know if you need anything else.";

							await sendTextMessage(
								provider,
								apiToken,
								msg.chatId,
								ackMessage,
							);
							trackBotMessage(redis, ackMessage);

							const conversationExists =
								await db.aiConversation.findUnique({
									where: { id: conversation.id },
									select: { id: true },
								});

							if (conversationExists) {
								await db.aiMessage.create({
									data: {
										conversationId: conversation.id,
										role: "assistant",
										content: ackMessage,
									},
								});

								await db.aiConversation.update({
									where: { id: conversation.id },
									data: {
										messageCount: {
											increment: bufferedTexts.length + 1,
										},
										lastMessageAt: new Date(),
									},
								});
							}
							continue;
						}

						// decision === "respond" \u2014 fall through to normal generation
					}

					// Check AI messages quota (1 per response)
					const quotaResult = await checkAndIncrementQuota(
						{
							type: "organization",
							organizationId: channel.agent.organizationId,
						},
						"aiMessages",
					);
					if (!quotaResult.allowed) {
						await sendTextMessage(
							provider,
							apiToken,
							msg.chatId,
							QUOTA_EXCEEDED_MESSAGE,
						);
						trackBotMessage(redis, QUOTA_EXCEEDED_MESSAGE);
						break;
					}

					// Load full conversation history (includes all stored messages)
					const history = await db.aiMessage.findMany({
						where: {
							conversationId: conversation.id,
						},
						orderBy: { createdAt: "desc" },
						take: channel.agent.maxHistoryLength,
						select: { role: true, content: true, toolCalls: true },
					});
					const historyMessages = history
						.reverse()
						.map(formatHistoryMessage);

					// Inject context gap note if significant time has passed
					const gapNote = buildContextGapNote(
						previousLastMessageAt,
						channel.agent.contextGapThresholdMinutes,
					);
					if (gapNote && historyMessages.length > 0) {
						// Insert just before the final user message(s)
						let insertIdx = historyMessages.length - 1;
						while (
							insertIdx > 0 &&
							historyMessages[insertIdx - 1]?.role === "user"
						) {
							insertIdx--;
						}
						historyMessages.splice(insertIdx, 0, {
							role: "user",
							content: gapNote,
						});
					}

					// Merge consecutive trailing user messages into one
					// (rapid-fire messages get stored separately but should be read as one thought)
					if (
						bufferedTexts.length > 1 &&
						historyMessages.length > 1
					) {
						let i = historyMessages.length - 1;
						const trailingParts: string[] = [];
						while (i >= 0 && historyMessages[i]?.role === "user") {
							trailingParts.unshift(
								historyMessages[i]?.content ?? "",
							);
							i--;
						}
						if (trailingParts.length > 1) {
							// Remove the individual trailing user messages
							historyMessages.splice(
								i + 1,
								trailingParts.length,
								{
									role: "user",
									content: trailingParts.join(" "),
								},
							);
						}
					}

					// Send typing indicator before generation + refresh periodically
					sendTypingIndicator(provider, apiToken, msg.chatId).catch(
						() => {},
					);
					const typingInterval = setInterval(() => {
						sendTypingIndicator(
							provider,
							apiToken,
							msg.chatId,
						).catch(() => {});
					}, 8000);

					// Generate AI response with timeout
					const timeoutMs = config.ai.responseTimeoutMs;
					const controller = new AbortController();
					const timeout = setTimeout(
						() => controller.abort(),
						timeoutMs,
					);

					try {
						let sentInitial = false;
						const result = await generateAgentResponse({
							model: channel.agent.model,
							systemPrompt,
							knowledgeBase:
								channel.agent.knowledgeBase ?? undefined,
							messages: historyMessages,
							temperature: channel.agent.temperature,
							abortSignal: controller.signal,
							tools,
							maxSteps: tools ? 10 : undefined,
							onToolActivity: () => {
								sendTypingIndicator(
									provider,
									apiToken,
									msg.chatId,
								).catch(() => {});
							},
							onStepText: tools
								? async (stepText) => {
										if (sentInitial) {
											return;
										}
										// Re-check takeover — admin may have
										// taken over during the tool chain.
										if (
											await isTakeoverActiveFresh(
												conversation.id,
												channel.agent
													.humanTakeoverHours,
											)
										) {
											controller.abort();
											return;
										}
										sentInitial = true;
										await sendTextMessage(
											provider,
											apiToken,
											msg.chatId,
											stepText,
										);
										trackBotMessage(redis, stepText);
									}
								: undefined,
						});

						clearTimeout(timeout);
						clearInterval(typingInterval);

						// Strip tool annotations the model may have mimicked from history
						result.text = stripToolAnnotation(result.text);

						// Escalation safety net: if model said it would escalate but didn't call the tool, do it now
						if (
							tools &&
							channel.agent.enabledTools.includes(
								"escalate-telegram",
							)
						) {
							const guardResult = await executeEscalationGuard({
								tools,
								responseText: result.text,
								toolResults: result.toolResults,
								customerName: msg.contactName ?? undefined,
								customerPhone: msg.contactId ?? undefined,
								conversationMessages: historyMessages,
								conversationId: conversation.id,
							});
							if (guardResult) {
								if (!result.toolResults) {
									result.toolResults = [];
								}
								result.toolResults.push(guardResult);
							}
						}

						// Re-check takeover — admin may have taken over during
						// generation (tool chains can take 10–30s). If so,
						// drop the generated reply entirely: don't send,
						// don't store, don't bump counters. The tokens are
						// already spent but we don't want the customer to
						// see a bot reply after the admin already took over.
						if (
							await isTakeoverActiveFresh(
								conversation.id,
								channel.agent.humanTakeoverHours,
							)
						) {
							logger.info(
								"Dropping AI reply — human takeover activated during generation",
								{
									conversationId: conversation.id,
									chatId: msg.chatId,
								},
							);
							break;
						}

						// Send reply
						const sendResult = await sendTextMessage(
							provider,
							apiToken,
							msg.chatId,
							result.text,
						);

						// Track bot-sent message by content fingerprint so we don't mistake the echo for human activity
						trackBotMessage(redis, result.text);

						// Store assistant message (conversation may have been cleared concurrently)
						const conversationExists =
							await db.aiConversation.findUnique({
								where: { id: conversation.id },
								select: { id: true },
							});

						if (conversationExists) {
							await db.aiMessage.create({
								data: {
									conversationId: conversation.id,
									role: "assistant",
									content: result.text,
									externalMsgId: sendResult.messageId ?? null,
									tokenCount: result.tokenCount,
									latencyMs: result.latencyMs,
									toolCalls: result.toolResults
										? JSON.parse(
												JSON.stringify(
													result.toolResults,
												),
											)
										: null,
								},
							});

							// Update conversation counters
							await db.aiConversation.update({
								where: {
									id: conversation.id,
								},
								data: {
									messageCount: {
										increment: bufferedTexts.length + 1,
									},
									lastMessageAt: new Date(),
								},
							});
						}

						// Track for triage on subsequent iterations
						lastAssistantText = result.text;
						isFirstIteration = false;
					} catch (error) {
						clearTimeout(timeout);
						clearInterval(typingInterval);

						const errorName =
							error instanceof Error ? error.name : "";

						// If generation was aborted because the admin took
						// over mid-flight, swallow the error silently —
						// don't send a retry/fallback message to the customer.
						if (
							errorName === "AbortError" &&
							(await isTakeoverActiveFresh(
								conversation.id,
								channel.agent.humanTakeoverHours,
							))
						) {
							logger.info(
								"AI generation aborted — human takeover active",
								{ conversationId: conversation.id },
							);
							break;
						}

						const isToolError =
							errorName === "AI_InvalidToolInputError" ||
							errorName === "AI_NoSuchToolError";

						if (errorName === "AI_InvalidToolInputError") {
							const toolError = error as Error & {
								toolName?: string;
							};
							logger.error("AI invalid tool input", {
								toolName: toolError.toolName,
								conversationId: conversation.id,
								provider,
							});
						} else if (errorName === "AI_NoSuchToolError") {
							const toolError = error as Error & {
								toolName?: string;
							};
							logger.error("AI tool not found", {
								toolName: toolError.toolName,
								conversationId: conversation.id,
								provider,
							});
						} else {
							logger.error("AI generation failed", {
								error,
								conversationId: conversation.id,
								provider,
							});
						}

						// For transient errors, enqueue a retry via BullMQ
						if (!isToolError) {
							await sendTextMessage(
								provider,
								apiToken,
								msg.chatId,
								RETRY_MESSAGE,
							);
							trackBotMessage(redis, RETRY_MESSAGE);
							queueAiChatRetry({
								conversationId: conversation.id,
								channelId: channel.id,
							}).catch((retryError) => {
								logger.error("Failed to queue AI chat retry", {
									retryError,
									conversationId: conversation.id,
								});
							});
						} else {
							await sendTextMessage(
								provider,
								apiToken,
								msg.chatId,
								FALLBACK_MESSAGE,
							);
							trackBotMessage(redis, FALLBACK_MESSAGE);
						}

						const errorMessage = isToolError
							? FALLBACK_MESSAGE
							: RETRY_MESSAGE;

						// Store error message (conversation may have been cleared concurrently)
						const conversationExists =
							await db.aiConversation.findUnique({
								where: { id: conversation.id },
								select: { id: true },
							});

						if (conversationExists) {
							await db.aiMessage.create({
								data: {
									conversationId: conversation.id,
									role: "assistant",
									content: errorMessage,
									error:
										error instanceof Error
											? error.message
											: "Unknown error",
								},
							});

							await db.aiConversation.update({
								where: {
									id: conversation.id,
								},
								data: {
									messageCount: {
										increment: bufferedTexts.length + 1,
									},
									lastMessageAt: new Date(),
								},
							});
						}

						break;
					}
				}
			} finally {
				activeGenerations--;
				clearInterval(lockRenewal);
				// Release lock atomically — only if we still own it
				await redis.eval(
					`if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
					1,
					lockKey,
					lockValue,
				);
			}

			// Update channel activity
			await db.aiAgentChannel.update({
				where: { id: channel.id },
				data: { lastActivityAt: new Date() },
			});
		} catch (error) {
			logger.error("Webhook message processing failed", {
				error,
				provider,
				chatId: msg.chatId,
			});
		}
	}

	return new Response("OK", { status: 200 });
}

// ─── Incoming Webhook Event Handlers (receipts, reactions, deletions) ───

async function handleReceiptEvents(body: unknown): Promise<void> {
	const receipts = whatsapp.parseReceiptUpdate(body);
	for (const receipt of receipts) {
		try {
			await db.aiMessage.updateMany({
				where: { externalMsgId: receipt.messageId },
				data: { deliveryStatus: receipt.status },
			});
		} catch (error) {
			logger.error("Failed to update delivery status", {
				error,
				messageId: receipt.messageId,
			});
		}
	}
}

async function handleReactionEvents(body: unknown): Promise<void> {
	const reactions = whatsapp.parseReactionEvent(body);
	for (const reaction of reactions) {
		try {
			const message = await db.aiMessage.findFirst({
				where: { externalMsgId: reaction.messageId },
				select: { id: true },
			});
			if (!message) {
				continue;
			}

			if (reaction.isRemoval) {
				// Remove reaction by contactId
				if (reaction.contactId) {
					await db.aiMessageReaction.deleteMany({
						where: {
							messageId: message.id,
							contactId: reaction.contactId,
						},
					});
				}
			} else {
				// Upsert reaction
				if (reaction.contactId) {
					const existing = await db.aiMessageReaction.findUnique({
						where: {
							messageId_contactId: {
								messageId: message.id,
								contactId: reaction.contactId,
							},
						},
					});
					if (existing) {
						await db.aiMessageReaction.update({
							where: { id: existing.id },
							data: { emoji: reaction.emoji },
						});
					} else {
						await db.aiMessageReaction.create({
							data: {
								messageId: message.id,
								emoji: reaction.emoji,
								contactId: reaction.contactId,
							},
						});
					}
				}
			}
		} catch (error) {
			logger.error("Failed to handle reaction event", {
				error,
				messageId: reaction.messageId,
			});
		}
	}
}

async function handleDeleteEvents(body: unknown): Promise<void> {
	const deletions = whatsapp.parseDeleteEvent(body);
	for (const deletion of deletions) {
		try {
			await db.aiMessage.updateMany({
				where: { externalMsgId: deletion.messageId },
				data: { deletedAt: new Date() },
			});
		} catch (error) {
			logger.error("Failed to handle delete event", {
				error,
				messageId: deletion.messageId,
			});
		}
	}
}

export async function whatsappWebhookHandler(
	request: Request,
	webhookToken: string,
): Promise<Response> {
	try {
		const body = await request.json();
		// Respond immediately — WhatsApp only needs a 200 OK acknowledgment.
		// Actual message processing (media transcription, AI generation, sending replies)
		// happens in the background via the WaSender API.
		handleMessages(webhookToken, "whatsapp", body).catch((error) => {
			logger.error("WhatsApp webhook background processing failed", {
				error,
			});
		});

		// Process non-message events (receipts, reactions, deletions) in background
		handleReceiptEvents(body).catch(() => {});
		handleReactionEvents(body).catch(() => {});
		handleDeleteEvents(body).catch(() => {});

		return new Response("OK", { status: 200 });
	} catch (error) {
		logger.error("WhatsApp webhook error", { error });
		return new Response("OK", { status: 200 });
	}
}

export async function telegramWebhookHandler(
	request: Request,
	webhookToken: string,
): Promise<Response> {
	try {
		const body = await request.json();
		const secretHeader = request.headers.get(
			"x-telegram-bot-api-secret-token",
		);
		// Respond immediately — Telegram only needs a 200 OK acknowledgment.
		// Actual message processing happens in the background via the Bot API.
		handleMessages(webhookToken, "telegram", body, secretHeader).catch(
			(error) => {
				logger.error("Telegram webhook background processing failed", {
					error,
				});
			},
		);
		return new Response("OK", { status: 200 });
	} catch (error) {
		logger.error("Telegram webhook error", { error });
		return new Response("OK", { status: 200 });
	}
}

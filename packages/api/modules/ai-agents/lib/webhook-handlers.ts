import type {
	ChannelProvider,
	GenerateResponseInput,
	ToolContext,
} from "@repo/ai";
import {
	buildSystemPrompt,
	decryptToken,
	executeEscalationGuard,
	generateAgentResponse,
	markAsRead,
	parseWebhookPayload,
	processMedia,
	resolveTools,
	sendTextMessage,
	sendTypingIndicator,
	telegram,
	triageBufferedMessages,
} from "@repo/ai";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { getRedisConnection } from "@repo/jobs";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";
const QUOTA_EXCEEDED_MESSAGE =
	"This agent has reached its message limit. Please contact the organization administrator.";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
			// Mark message as read (fire-and-forget)
			markAsRead(provider, apiToken, msg.messageId, msg.chatId).catch(
				() => {},
			);

			// Handle /clear command \u2014 delete conversation and messages
			if (msg.text.trim().toLowerCase() === "/clear") {
				const redis = getRedisConnection();
				const lockKey = `ai:lock:${channel.id}:${msg.chatId}`;
				const bufferKey = `ai:buffer:${channel.id}:${msg.chatId}`;

				// Acquire the processing lock so we don't delete mid-generation
				let clearLockAcquired = false;
				for (let i = 0; i < 60; i++) {
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

				try {
					// Drain any buffered messages
					await redis.del(bufferKey);

					const existing = await db.aiConversation.findUnique({
						where: {
							channelId_externalChatId: {
								channelId: channel.id,
								externalChatId: msg.chatId,
							},
						},
					});
					if (existing) {
						await db.aiMessage.deleteMany({
							where: { conversationId: existing.id },
						});
						await db.aiConversation.deleteMany({
							where: { id: existing.id },
						});
					}
				} finally {
					await redis.del(lockKey);
				}

				await sendTextMessage(
					provider,
					apiToken,
					msg.chatId,
					"Conversation cleared. Send a message to start fresh.",
				);
				continue;
			}

			// Process media attachments (voice \u2192 transcription, image \u2192 description)
			let messageText = msg.text;
			if (msg.mediaId && msg.mediaType) {
				const processed = await processMedia(
					apiToken,
					msg.mediaType,
					msg.mediaId,
					msg.mediaCaption,
					msg.mediaLink,
				);
				if (processed) {
					if (msg.mediaType === "voice") {
						messageText = processed;
					} else if (msg.mediaType === "image") {
						messageText = msg.mediaCaption
							? `[Image: ${processed}] ${msg.mediaCaption}`
							: `[Image: ${processed}]`;
					}
				}
			}

			// Truncate incoming message
			const truncatedText = messageText.slice(
				0,
				config.ai.maxMessageLength,
			);

			// Find or create conversation
			const conversation = await db.aiConversation.upsert({
				where: {
					channelId_externalChatId: {
						channelId: channel.id,
						externalChatId: msg.chatId,
					},
				},
				create: {
					agentId: channel.agent.id,
					channelId: channel.id,
					externalChatId: msg.chatId,
					contactName: msg.contactName ?? null,
					contactId: msg.contactId ?? null,
					lastMessageAt: new Date(),
					messageCount: 0,
				},
				update: {
					contactName: msg.contactName ?? null,
					lastMessageAt: new Date(),
				},
			});

			// Store user message in DB immediately
			await db.aiMessage.create({
				data: {
					conversationId: conversation.id,
					role: "user",
					content: truncatedText,
					externalMsgId: msg.messageId,
				},
			});

			// Buffer message text and try to acquire processing lock
			const redis = getRedisConnection();
			const bufferKey = `ai:buffer:${channel.id}:${msg.chatId}`;
			const lockKey = `ai:lock:${channel.id}:${msg.chatId}`;

			await redis.rpush(bufferKey, truncatedText);
			const lockAcquired = await redis.set(lockKey, "1", "EX", 120, "NX");

			if (!lockAcquired) {
				// Active processor will pick up the buffered message
				continue;
			}

			// Resolve tools once (same for all messages in this chat)
			let tools: GenerateResponseInput["tools"];
			if (channel.agent.enabledTools.length > 0) {
				const agentToolConfigs = await db.aiAgentToolConfig.findMany({
					where: { agentId: channel.agent.id },
				});
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
			});

			// Processing loop \u2014 handles buffered messages + any that arrive during generation
			let isFirstIteration = true;
			let lastAssistantText = "";
			const lastUserMessage = truncatedText;

			try {
				while (true) {
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
						break;
					}

					// Load full conversation history (includes all stored messages)
					const history = await db.aiMessage.findMany({
						where: {
							conversationId: conversation.id,
						},
						orderBy: { createdAt: "desc" },
						take: channel.agent.maxHistoryLength,
						select: { role: true, content: true },
					});
					const historyMessages = history.reverse().map((m) => ({
						role: (m.role === "admin" ? "assistant" : m.role) as
							| "user"
							| "assistant",
						content: m.content,
					}));

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

					// Send typing indicator before generation
					sendTypingIndicator(provider, apiToken, msg.chatId).catch(
						() => {},
					);

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
							abortController: controller,
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
										sentInitial = true;
										await sendTextMessage(
											provider,
											apiToken,
											msg.chatId,
											stepText,
										);
									}
								: undefined,
						});

						clearTimeout(timeout);

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

						// Send reply
						const sendResult = await sendTextMessage(
							provider,
							apiToken,
							msg.chatId,
							result.text,
						);

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

						const errorName =
							error instanceof Error ? error.name : "";

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

						// Send fallback message
						await sendTextMessage(
							provider,
							apiToken,
							msg.chatId,
							FALLBACK_MESSAGE,
						);

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
									content: FALLBACK_MESSAGE,
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
				// Always release the processing lock
				await redis.del(lockKey);
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

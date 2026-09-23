import {
	assistantMessageToParts,
	buildAgentMessages,
	buildAgentTelemetry,
	type ChannelProvider,
	computeBotFingerprint,
	decryptToken,
	executeEscalationGuard,
	extractToolPromptOverrides,
	fetchServicePlansSection,
	generateAgentResponse,
	isHumanTakeoverActive,
	loadHistoryRows,
	maybeEscalateUnknownContact,
	modelMessagesToRoleContent,
	type PromptSection,
	resolveAgentCredentials,
	resolveAgentTools,
	resolveMaintenanceState,
	sendTextMessage,
	sendTypingIndicator,
	shouldDeferToTeammate,
} from "@repo/ai";
import { config } from "@repo/config";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { scheduleFollowUp } from "../jobs/ai-followup.jobs";
import { AI_CHAT_QUEUE_NAME } from "../queues/ai-chat.queue";
import type { AiChatJobData, AiChatJobResult } from "../types";

const RETRY_FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAiChatWorker(): Worker<AiChatJobData, AiChatJobResult> {
	return new Worker<AiChatJobData, AiChatJobResult>(
		AI_CHAT_QUEUE_NAME,
		async (job: Job<AiChatJobData>) => {
			const { conversationId, channelId } = job.data;

			logger.info(`Processing AI chat retry job ${job.id}`, {
				conversationId,
				channelId,
			});

			const now = new Date();
			const conversation = await db.aiConversation.findUnique({
				where: { id: conversationId },
				include: {
					agent: {
						include: {
							maintenanceWindows: {
								where: {
									startsAt: { lte: now },
									endsAt: { gt: now },
								},
								orderBy: { endsAt: "asc" },
								select: { message: true },
							},
						},
					},
					channel: true,
					verifiedCustomer: {
						select: {
							firstName: true,
							lastName: true,
							username: true,
							accountNumber: true,
							status: true,
							plan: { select: { name: true } },
						},
					},
				},
			});

			if (!conversation || !conversation.channel || !conversation.agent) {
				return { success: false, error: "Conversation not found" };
			}

			if (
				isHumanTakeoverActive(
					conversation.humanTakeoverAt,
					conversation.agent.humanTakeoverHours,
				)
			) {
				return { success: true, error: "Human takeover active" };
			}

			// Same gate as the webhook: without it, reconcile-orphaned-chats
			// re-queues a deferred customer message on the next deploy and the
			// bot answers it anyway.
			if (!conversation.agent.encryptedApiKey) {
				logger.error("AI agent has no API key — retry dropped", {
					conversationId,
					agentId: conversation.agent.id,
				});
				return { success: false, error: "Agent has no API key" };
			}
			const credentials = resolveAgentCredentials(conversation.agent);

			if (await shouldDeferToTeammate({ conversationId, credentials })) {
				logger.info("ai-teammate-reply-deferred", {
					conversationId,
					path: "retry-worker",
				});
				return {
					success: true,
					error: "Customer is answering a teammate",
				};
			}

			const apiToken = decryptToken(
				conversation.channel.encryptedApiToken,
			);

			// Respect the per-chat processing lock the webhook flow uses. If an
			// active processor owns the chat (customer sent a new message), it
			// sees the same DB history and will reply itself — a concurrent
			// retry would interleave duplicate, out-of-order replies.
			const redis = getRedisConnection();
			const lockKey = `ai:lock:${conversation.channelId ?? channelId}:${conversation.externalChatId}`;
			const lockValue = `retry-${job.id ?? "job"}-${Date.now()}`;
			let lockAcquired = false;
			for (let i = 0; i < 4; i++) {
				lockAcquired = Boolean(
					await redis.set(lockKey, lockValue, "EX", 120, "NX"),
				);
				if (lockAcquired) {
					break;
				}
				await sleep(2000);
			}
			if (!lockAcquired) {
				logger.info("AI chat retry skipped — chat lock busy", {
					conversationId,
					channelId,
				});
				return {
					success: true,
					error: "Chat lock busy — active processor owns the reply",
				};
			}
			// Renewal starts inside the main try below; until then the 120s
			// TTL covers the (fast) history load, and expiry self-heals if we
			// crash before reaching it.
			let lockRenewal: ReturnType<typeof setInterval> | undefined;

			const historyRows = await loadHistoryRows(
				conversationId,
				conversation.agent.maxHistoryLength,
			);

			const maintenance = resolveMaintenanceState(
				conversation.agent,
				conversation.agent.maintenanceWindows,
			);

			const { tools, agentToolConfigs } = await resolveAgentTools({
				credentials,
				agent: conversation.agent,
				maintenanceActive: maintenance.active,
				conversationId: conversation.id,
				externalChatId: conversation.externalChatId,
				contactName: conversation.contactName ?? undefined,
				contactPhone: conversation.contactId ?? undefined,
			});

			const servicePlans = await fetchServicePlansSection(
				conversation.agent.organizationId,
				conversation.agent.servicePlansEnabled,
				conversation.agent.servicePlanIds,
			);

			const verifiedCustomer = conversation.verifiedCustomer
				? {
						fullName:
							[
								conversation.verifiedCustomer.firstName,
								conversation.verifiedCustomer.lastName,
							]
								.filter(Boolean)
								.join(" ") || undefined,
						username:
							conversation.verifiedCustomer.username ?? undefined,
						accountNumber:
							conversation.verifiedCustomer.accountNumber ??
							undefined,
						status: conversation.verifiedCustomer.status,
						planName:
							conversation.verifiedCustomer.plan?.name ??
							undefined,
					}
				: undefined;

			const messages = buildAgentMessages({
				conversationId,
				systemOptions: {
					basePrompt: conversation.agent.systemPrompt,
					enabledTools: conversation.agent.enabledTools,
					knowledgeBase:
						conversation.agent.knowledgeBase ?? undefined,
					contactName: conversation.contactName ?? undefined,
					contactPhone: conversation.contactId ?? undefined,
					verifiedCustomer,
					maintenanceMode: maintenance.active,
					maintenanceMessage: maintenance.message ?? undefined,
					provider: conversation.channel?.provider ?? "messaging",
					servicePlans,
					workingHours: conversation.agent,
					promptSections: conversation.agent
						.promptSections as unknown as PromptSection[],
					toolPromptOverrides:
						extractToolPromptOverrides(agentToolConfigs),
				},
				history: historyRows,
				lastMessageAt: conversation.lastMessageAt,
				contextGapThresholdMinutes:
					conversation.agent.contextGapThresholdMinutes,
			});

			try {
				lockRenewal = setInterval(async () => {
					try {
						const current = await redis.get(lockKey);
						if (current === lockValue) {
							await redis.expire(lockKey, 120);
						}
					} catch {
						// Ignore renewal errors
					}
				}, 30_000);

				const provider = conversation.channel
					.provider as ChannelProvider;
				const chatId = conversation.externalChatId;

				sendTypingIndicator(provider, apiToken, chatId).catch(() => {});
				const typingInterval = setInterval(() => {
					sendTypingIndicator(provider, apiToken, chatId).catch(
						() => {},
					);
				}, 8000);

				const abortController = new AbortController();
				const timeout = setTimeout(
					() => abortController.abort(),
					config.ai.responseTimeoutMs,
				);

				let result: Awaited<ReturnType<typeof generateAgentResponse>>;
				try {
					result = await generateAgentResponse({
						credentials,
						model: conversation.agent.model,
						messages,
						temperature: conversation.agent.temperature,
						sessionId: conversationId,
						tools,
						abortSignal: abortController.signal,
						telemetry: buildAgentTelemetry({
							conversationId: conversation.id,
							agentId: conversation.agent.id,
							organizationId: conversation.agent.organizationId,
							channelId: conversation.channelId,
							provider,
							verifiedCustomerId: conversation.verifiedCustomerId,
						}),
						onToolActivity: () => {
							sendTypingIndicator(
								provider,
								apiToken,
								chatId,
							).catch(() => {});
						},
					});
				} finally {
					clearTimeout(timeout);
					clearInterval(typingInterval);
				}

				// Escalation safety net.
				if (
					tools &&
					conversation.agent.enabledTools.includes(
						"escalate-telegram",
					)
				) {
					const conversationMessages =
						modelMessagesToRoleContent(messages);
					const guardResult = await executeEscalationGuard({
						credentials,
						tools,
						responseText: result.text,
						toolResults: result.toolResults,
						customerName: conversation.contactName ?? undefined,
						customerPhone: conversation.contactId ?? undefined,
						conversationMessages,
						conversationId,
					});
					if (guardResult) {
						if (!result.toolResults) {
							result.toolResults = [];
						}
						result.toolResults.push(guardResult);
					}
				}

				// Unknown-contact auto-escalation (shared with the webhook path).
				const unknown = await maybeEscalateUnknownContact({
					conversation: {
						id: conversation.id,
						organizationId: conversation.agent.organizationId,
						contactName: conversation.contactName,
						contactId: conversation.contactId,
						verifiedCustomerId: conversation.verifiedCustomerId,
						unknownEscalatedAt: conversation.unknownEscalatedAt,
					},
					enabledTools: conversation.agent.enabledTools,
					tools,
					history: historyRows,
					contextGapThresholdMinutes:
						conversation.agent.contextGapThresholdMinutes,
					replyText: result.text,
				});
				if (unknown) {
					result.text = `${result.text}\n\n${unknown.note}`;
					result.toolResults = [
						...(result.toolResults ?? []),
						unknown.toolResult,
					];
				}

				const sendResult = await sendTextMessage(
					provider,
					apiToken,
					chatId,
					result.text,
				);
				if (!sendResult.success) {
					logger.error(
						"AI retry reply send failed — persisting as failed delivery",
						{ conversationId, chatId, provider },
					);
				}

				if (result.text) {
					const fp = computeBotFingerprint(result.text);
					redis
						.set(`ai:bot-fp:${fp}`, "1", "EX", 600)
						.catch(() => {});
				}

				const assistantParts = assistantMessageToParts(
					result.text,
					result.toolResults,
				);
				await db.aiMessage.create({
					data: {
						conversationId,
						role: "assistant",
						content: result.text,
						externalMsgId: sendResult.messageId ?? null,
						tokenCount: result.tokenCount,
						inputTokens: result.inputTokens,
						outputTokens: result.outputTokens,
						cacheReadTokens: result.cacheReadTokens,
						cacheWriteTokens: result.cacheWriteTokens,
						latencyMs: result.latencyMs,
						...(sendResult.success
							? {}
							: { deliveryStatus: "failed" }),
						...(assistantParts.length > 0
							? { parts: assistantParts as Prisma.InputJsonValue }
							: {}),
					},
				});

				const repliedAt = new Date();
				await db.aiConversation.update({
					where: { id: conversationId },
					data: {
						messageCount: { increment: 1 },
						lastMessageAt: repliedAt,
					},
				});
				if (conversation.agent.followUpMinutes) {
					scheduleFollowUp({
						conversationId,
						channelId: conversation.channelId ?? channelId,
						from: repliedAt,
					}).catch((err) =>
						logger.warn("[ai-followup] schedule failed", {
							conversationId,
							error: String(err),
						}),
					);
				}

				return { success: true };
			} catch (error) {
				logger.error("AI chat retry job failed", {
					error,
					conversationId,
					attemptsMade: job.attemptsMade,
				});

				// On the final attempt, tell the customer instead of going
				// silent — their last sight was "Give me a moment...".
				const isFinalAttempt =
					job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
				if (isFinalAttempt) {
					try {
						const provider = conversation.channel
							.provider as ChannelProvider;
						await sendTextMessage(
							provider,
							apiToken,
							conversation.externalChatId,
							RETRY_FALLBACK_MESSAGE,
						);
						const fp = computeBotFingerprint(
							RETRY_FALLBACK_MESSAGE,
						);
						redis
							.set(`ai:bot-fp:${fp}`, "1", "EX", 600)
							.catch(() => {});
						await db.aiMessage.create({
							data: {
								conversationId,
								role: "assistant",
								content: RETRY_FALLBACK_MESSAGE,
								error:
									error instanceof Error
										? error.message
										: "Unknown error",
							},
						});
					} catch (fallbackError) {
						logger.error("AI retry fallback message failed", {
							fallbackError,
							conversationId,
						});
					}
				}

				// Rethrow so BullMQ counts the failure and re-fires remaining
				// attempts — returning {success:false} dead-ended the job.
				throw error;
			} finally {
				if (lockRenewal) {
					clearInterval(lockRenewal);
				}
				// Release the chat lock only if we still own it.
				await redis
					.eval(
						`if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
						1,
						lockKey,
						lockValue,
					)
					.catch(() => {});
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: config.jobs.workers.aiChat.concurrency,
		},
	);
}

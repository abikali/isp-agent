import {
	assistantMessageToParts,
	buildAgentMessages,
	buildAgentTelemetry,
	buildFollowUpInstruction,
	type ChannelProvider,
	computeBotFingerprint,
	decryptToken,
	generateAgentResponse,
	isHumanTakeoverActive,
	loadHistoryRows,
	NO_FOLLOW_UP,
	type PromptSection,
	resolveMaintenanceState,
	sendTextMessage,
	sendTypingIndicator,
} from "@repo/ai";
import { config } from "@repo/config";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { AI_FOLLOWUP_QUEUE_NAME } from "../queues/ai-followup.queue";
import type { AiFollowUpJobData, AiFollowUpJobResult } from "../types";

/**
 * One nudge when a customer goes quiet after the bot asked something.
 *
 * Every skip is a legitimate reason NOT to speak: the customer (or a human
 * teammate) wrote since, a human took over, maintenance is on, the nudge
 * already went out, or another process holds the chat. The model decides
 * whether the exchange was actually finished by answering NO_FOLLOW_UP.
 */
export function createAiFollowUpWorker(): Worker<
	AiFollowUpJobData,
	AiFollowUpJobResult
> {
	return new Worker<AiFollowUpJobData, AiFollowUpJobResult>(
		AI_FOLLOWUP_QUEUE_NAME,
		async (job: Job<AiFollowUpJobData>) => {
			const { conversationId, channelId, repliedAt } = job.data;
			const skip = (reason: string): AiFollowUpJobResult => {
				logger.info("[ai-followup] skipped", {
					conversationId,
					reason,
				});
				return { success: true, skipped: reason };
			};

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
			if (!conversation?.channel || !conversation.agent) {
				return skip("conversation_or_channel_missing");
			}
			const agent = conversation.agent;
			if (!agent.enabled || agent.followUpMinutes == null) {
				return skip("follow_up_disabled");
			}
			if (conversation.status !== "active") {
				return skip("conversation_not_active");
			}
			if (
				conversation.lastMessageAt &&
				conversation.lastMessageAt.getTime() >
					new Date(repliedAt).getTime() + 1000
			) {
				return skip("activity_since_reply");
			}
			if (
				isHumanTakeoverActive(
					conversation.humanTakeoverAt,
					agent.humanTakeoverHours,
				)
			) {
				return skip("human_takeover");
			}
			if (
				resolveMaintenanceState(agent, agent.maintenanceWindows).active
			) {
				return skip("maintenance");
			}
			if (conversation.followUpSentAt) {
				return skip("already_followed_up");
			}
			const lastRow = await db.aiMessage.findFirst({
				where: { conversationId },
				orderBy: { createdAt: "desc" },
				select: { role: true, error: true },
			});
			if (!lastRow || lastRow.role !== "assistant" || lastRow.error) {
				return skip("last_message_not_a_clean_reply");
			}

			// Per-chat lock, no retry: busy means the customer is writing.
			const redis = getRedisConnection();
			const lockKey = `ai:lock:${conversation.channelId ?? channelId}:${conversation.externalChatId}`;
			const lockValue = `followup-${job.id ?? "job"}-${Date.now()}`;
			const locked = Boolean(
				await redis.set(lockKey, lockValue, "EX", 120, "NX"),
			);
			if (!locked) {
				return skip("chat_lock_busy");
			}

			try {
				const apiToken = decryptToken(
					conversation.channel.encryptedApiToken,
				);
				const provider = conversation.channel
					.provider as ChannelProvider;
				const chatId = conversation.externalChatId;

				const history = await loadHistoryRows(
					conversationId,
					agent.maxHistoryLength,
				);
				const verified = conversation.verifiedCustomer;
				const messages = buildAgentMessages({
					conversationId,
					systemOptions: {
						basePrompt: agent.systemPrompt,
						// No tools: a nudge must never turn into a diagnostic.
						enabledTools: [],
						knowledgeBase: agent.knowledgeBase ?? undefined,
						contactName: conversation.contactName ?? undefined,
						contactPhone: conversation.contactId ?? undefined,
						verifiedCustomer: verified
							? {
									fullName:
										[verified.firstName, verified.lastName]
											.filter(Boolean)
											.join(" ") || undefined,
									username: verified.username ?? undefined,
									accountNumber:
										verified.accountNumber ?? undefined,
									status: verified.status,
									planName: verified.plan?.name ?? undefined,
								}
							: undefined,
						provider,
						promptSections:
							agent.promptSections as unknown as PromptSection[],
						workingHours: agent,
					},
					history,
					contextGapThresholdMinutes:
						agent.contextGapThresholdMinutes,
					newUserMessage: buildFollowUpInstruction(
						agent.followUpMinutes,
						agent.followUpMessage,
					),
				});

				const result = await generateAgentResponse({
					model: agent.model,
					messages,
					temperature: agent.temperature,
					sessionId: conversationId,
					telemetry: buildAgentTelemetry({
						conversationId,
						agentId: agent.id,
						organizationId: agent.organizationId,
						channelId: conversation.channelId,
						provider,
						verifiedCustomerId: conversation.verifiedCustomerId,
					}),
					abortSignal: AbortSignal.timeout(60_000),
				});
				const text = result.text.trim();
				if (!text || text.replace(/[.\s]/g, "") === NO_FOLLOW_UP) {
					return skip("model_declined");
				}

				sendTypingIndicator(provider, apiToken, chatId).catch(() => {});
				const sendResult = await sendTextMessage(
					provider,
					apiToken,
					chatId,
					text,
				);
				redis
					.set(
						`ai:bot-fp:${computeBotFingerprint(text)}`,
						"1",
						"EX",
						600,
					)
					.catch(() => {});
				const parts = assistantMessageToParts(text, result.toolResults);
				await db.aiMessage.create({
					data: {
						conversationId,
						role: "assistant",
						content: text,
						externalMsgId: sendResult.messageId ?? null,
						tokenCount: result.tokenCount,
						inputTokens: result.inputTokens,
						outputTokens: result.outputTokens,
						latencyMs: result.latencyMs,
						...(sendResult.success
							? {}
							: { deliveryStatus: "failed" }),
						...(parts.length > 0
							? { parts: parts as Prisma.InputJsonValue }
							: {}),
					},
				});
				await db.aiConversation.update({
					where: { id: conversationId },
					data: {
						messageCount: { increment: 1 },
						lastMessageAt: new Date(),
						followUpSentAt: new Date(),
					},
				});
				logger.info("[ai-followup] sent", { conversationId });
				return { success: true };
			} finally {
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
			concurrency: config.jobs.workers.aiFollowup.concurrency,
		},
	);
}

import {
	assistantMessageToParts,
	buildAgentMessages,
	buildAgentTelemetry,
	buildFollowUpInstruction,
	type ChannelProvider,
	computeBotFingerprint,
	decryptToken,
	fetchServicePlansSection,
	generateAgentResponse,
	isHumanTakeoverActive,
	isNoFollowUpReply,
	isWithinFollowUpHours,
	loadHistoryRows,
	type PromptSection,
	resolveMaintenanceState,
	sendTextMessage,
	sendTypingIndicator,
	stripInternalMarkers,
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
 * already went out, the bot's reply never reached the customer, it is outside
 * the 09:00–20:30 Beirut window (a job that fires late after a worker
 * restart), or another process holds the chat. The model decides whether
 * the exchange was actually finished by answering NO_FOLLOW_UP.
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
			if (!isWithinFollowUpHours(now)) {
				return skip("quiet_hours");
			}
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
				select: {
					role: true,
					error: true,
					deliveryStatus: true,
					createdAt: true,
				},
			});
			if (!lastRow || lastRow.role !== "assistant" || lastRow.error) {
				return skip("last_message_not_a_clean_reply");
			}
			if (lastRow.deliveryStatus === "failed") {
				return skip("last_reply_not_delivered");
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
				// A sales nudge ("still interested in the 10 Mbps plan?") must
				// quote the real prices, not remember them.
				const servicePlans = await fetchServicePlansSection(
					agent.organizationId,
					agent.servicePlansEnabled,
					agent.servicePlanIds,
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
						servicePlans,
						promptSections:
							agent.promptSections as unknown as PromptSection[],
						workingHours: agent,
						// The prompt's clock is the real one…
						now,
					},
					history,
					// …but the history is read as of the bot's last reply, so
					// the silence being followed up is not announced as a
					// "[Context Notice: … an earlier exchange]" right before
					// the instruction.
					now: lastRow.createdAt,
					contextGapThresholdMinutes:
						agent.contextGapThresholdMinutes,
					// Real silence: longer than the setting when the nudge
					// was moved to the next morning.
					newUserMessage: buildFollowUpInstruction(
						Math.max(
							agent.followUpMinutes,
							Math.round(
								(now.getTime() - lastRow.createdAt.getTime()) /
									60_000,
							),
						),
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
				const text = stripInternalMarkers(result.text);
				if (!text || isNoFollowUpReply(text)) {
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

import type {
	ChannelProvider,
	GenerateResponseInput,
	PromptSection,
	ToolContext,
} from "@repo/ai";
import {
	buildContextGapNote,
	buildSystemPrompt,
	computeBotFingerprint,
	decryptToken,
	executeEscalationGuard,
	extractToolPromptOverrides,
	formatHistoryMessage,
	generateAgentResponse,
	isHumanTakeoverActive,
	resolveTools,
	sendTextMessage,
	sendTypingIndicator,
	stripToolAnnotation,
} from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { AI_CHAT_QUEUE_NAME } from "../queues/ai-chat.queue";
import type { AiChatJobData, AiChatJobResult } from "../types";

export function createAiChatWorker(): Worker<AiChatJobData, AiChatJobResult> {
	return new Worker<AiChatJobData, AiChatJobResult>(
		AI_CHAT_QUEUE_NAME,
		async (job: Job<AiChatJobData>) => {
			const { conversationId, channelId } = job.data;

			logger.info(`Processing AI chat retry job ${job.id}`, {
				conversationId,
				channelId,
			});

			const conversation = await db.aiConversation.findUnique({
				where: { id: conversationId },
				include: {
					agent: true,
					channel: true,
				},
			});

			if (!conversation || !conversation.channel || !conversation.agent) {
				return { success: false, error: "Conversation not found" };
			}

			// Check if human takeover is active — skip AI generation
			if (
				isHumanTakeoverActive(
					conversation.humanTakeoverAt,
					conversation.agent.humanTakeoverHours,
				)
			) {
				return { success: true, error: "Human takeover active" };
			}

			const apiToken = decryptToken(
				conversation.channel.encryptedApiToken,
			);

			// Load history
			const history = await db.aiMessage.findMany({
				where: { conversationId },
				orderBy: { createdAt: "desc" },
				take: conversation.agent.maxHistoryLength,
				select: { role: true, content: true, toolCalls: true },
			});

			const messages = history.reverse().map(formatHistoryMessage);

			// Inject context gap note if significant time has passed
			const gapNote = buildContextGapNote(
				conversation.lastMessageAt,
				conversation.agent.contextGapThresholdMinutes,
			);
			if (gapNote && messages.length > 0) {
				let insertIdx = messages.length - 1;
				while (
					insertIdx > 0 &&
					messages[insertIdx - 1]?.role === "user"
				) {
					insertIdx--;
				}
				messages.splice(insertIdx, 0, {
					role: "user",
					content: gapNote,
				});
			}

			// Resolve tools if agent has any enabled
			let tools: GenerateResponseInput["tools"];
			const agentToolConfigs =
				conversation.agent.enabledTools.length > 0
					? await db.aiAgentToolConfig.findMany({
							where: { agentId: conversation.agent.id },
						})
					: [];

			if (conversation.agent.enabledTools.length > 0) {
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
					organizationId: conversation.agent.organizationId,
					agentId: conversation.agent.id,
					conversationId: conversation.id,
					externalChatId: conversation.externalChatId,
					contactName: conversation.contactName ?? undefined,
				};
				tools = resolveTools(
					conversation.agent.enabledTools,
					toolContext,
					perToolConfigs,
				);
			}

			// Fetch service plans section (if enabled)
			let servicePlans: string | undefined;
			if (conversation.agent.servicePlansEnabled) {
				const plans = await db.servicePlan.findMany({
					where: {
						organizationId: conversation.agent.organizationId,
						archived: false,
					},
					orderBy: { monthlyPrice: "asc" },
					select: {
						name: true,
						description: true,
						downloadSpeed: true,
						uploadSpeed: true,
						monthlyPrice: true,
					},
				});
				if (plans.length > 0) {
					const planLines = plans.map((plan, i) => {
						const lines = [
							`${i + 1}. ${plan.name}`,
							`   Download: ${plan.downloadSpeed} Mbps | Upload: ${plan.uploadSpeed} Mbps`,
							`   Price: ${plan.monthlyPrice}/month`,
						];
						if (plan.description) {
							lines.push(`   ${plan.description}`);
						}
						return lines.join("\n");
					});
					servicePlans = [
						"SERVICE PLANS (use this to answer customer questions about plans, pricing, and speeds):",
						"",
						...planLines,
						"",
						"When discussing plans, use ONLY the information above. Do not invent details.",
					].join("\n");
				}
			}

			// Build system prompt
			const systemPrompt = buildSystemPrompt({
				basePrompt: conversation.agent.systemPrompt,
				enabledTools: conversation.agent.enabledTools,
				contactName: conversation.contactName ?? undefined,
				contactPhone: conversation.contactId ?? undefined,
				maintenanceMode: conversation.agent.maintenanceMode,
				maintenanceMessage:
					conversation.agent.maintenanceMessage ?? undefined,
				provider: conversation.channel?.provider ?? "messaging",
				servicePlans,
				promptSections: conversation.agent
					.promptSections as unknown as PromptSection[],
				toolPromptOverrides:
					extractToolPromptOverrides(agentToolConfigs),
			});

			try {
				const provider = conversation.channel
					.provider as ChannelProvider;
				const chatId = conversation.externalChatId;

				// Send typing indicator before generation + refresh periodically
				sendTypingIndicator(provider, apiToken, chatId).catch(() => {});
				const typingInterval = setInterval(() => {
					sendTypingIndicator(provider, apiToken, chatId).catch(
						() => {},
					);
				}, 8000);

				let result: Awaited<ReturnType<typeof generateAgentResponse>>;
				try {
					result = await generateAgentResponse({
						model: conversation.agent.model,
						systemPrompt,
						knowledgeBase:
							conversation.agent.knowledgeBase ?? undefined,
						messages,
						temperature: conversation.agent.temperature,
						tools,
						maxSteps: tools ? 10 : undefined,
						onToolActivity: () => {
							sendTypingIndicator(
								provider,
								apiToken,
								chatId,
							).catch(() => {});
						},
					});
				} finally {
					clearInterval(typingInterval);
				}

				// Strip tool annotations the model may have mimicked from history
				result.text = stripToolAnnotation(result.text);

				// Escalation safety net
				if (
					tools &&
					conversation.agent.enabledTools.includes(
						"escalate-telegram",
					)
				) {
					const guardResult = await executeEscalationGuard({
						tools,
						responseText: result.text,
						toolResults: result.toolResults,
						customerName: conversation.contactName ?? undefined,
						customerPhone: conversation.contactId ?? undefined,
						conversationMessages: messages,
						conversationId,
					});
					if (guardResult) {
						if (!result.toolResults) {
							result.toolResults = [];
						}
						result.toolResults.push(guardResult);
					}
				}

				const sendResult = await sendTextMessage(
					provider,
					apiToken,
					chatId,
					result.text,
				);

				// Track bot-sent message by content fingerprint
				if (result.text) {
					const redis = getRedisConnection();
					const fp = computeBotFingerprint(result.text);
					redis
						.set(`ai:bot-fp:${fp}`, "1", "EX", 600)
						.catch(() => {});
				}

				await db.aiMessage.create({
					data: {
						conversationId,
						role: "assistant",
						content: result.text,
						externalMsgId: sendResult.messageId ?? null,
						tokenCount: result.tokenCount,
						latencyMs: result.latencyMs,
						toolCalls: result.toolResults
							? JSON.parse(JSON.stringify(result.toolResults))
							: undefined,
					},
				});

				await db.aiConversation.update({
					where: { id: conversationId },
					data: {
						messageCount: { increment: 1 },
						lastMessageAt: new Date(),
					},
				});

				return { success: true };
			} catch (error) {
				logger.error("AI chat retry job failed", {
					error,
					conversationId,
				});
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Unknown error",
				};
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: 10,
		},
	);
}

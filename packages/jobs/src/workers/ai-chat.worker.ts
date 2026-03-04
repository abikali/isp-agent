import type {
	ChannelProvider,
	GenerateResponseInput,
	PromptSection,
	ToolContext,
} from "@repo/ai";
import {
	buildSystemPrompt,
	decryptToken,
	executeEscalationGuard,
	extractToolPromptOverrides,
	generateAgentResponse,
	resolveTools,
	sendTextMessage,
	sendTypingIndicator,
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

			const apiToken = decryptToken(
				conversation.channel.encryptedApiToken,
			);

			// Load history
			const history = await db.aiMessage.findMany({
				where: { conversationId },
				orderBy: { createdAt: "desc" },
				take: conversation.agent.maxHistoryLength,
				select: { role: true, content: true },
			});

			const messages = history.reverse().map((m) => ({
				role: (m.role === "admin" ? "assistant" : m.role) as
					| "user"
					| "assistant",
				content: m.content,
			}));

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

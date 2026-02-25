import type {
	ChannelProvider,
	GenerateResponseInput,
	ToolContext,
} from "@repo/ai";
import {
	decryptToken,
	ESCALATION_TOOL_INSTRUCTION,
	generateAgentResponse,
	resolveTools,
	sendTextMessage,
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
			if (conversation.agent.enabledTools.length > 0) {
				const agentToolConfigs = await db.aiAgentToolConfig.findMany({
					where: { agentId: conversation.agent.id },
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

			// Enhance system prompt for escalation
			let systemPrompt = conversation.agent.systemPrompt;
			if (
				tools &&
				conversation.agent.enabledTools.includes("escalate-telegram")
			) {
				systemPrompt += ESCALATION_TOOL_INSTRUCTION;
			}

			try {
				const result = await generateAgentResponse({
					model: conversation.agent.model,
					systemPrompt,
					knowledgeBase:
						conversation.agent.knowledgeBase ?? undefined,
					messages,
					temperature: conversation.agent.temperature,
					tools,
					maxSteps: tools ? 10 : undefined,
				});

				const sendResult = await sendTextMessage(
					conversation.channel.provider as ChannelProvider,
					apiToken,
					conversation.externalChatId,
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

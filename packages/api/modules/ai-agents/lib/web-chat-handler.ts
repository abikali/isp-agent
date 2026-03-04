import { ORPCError } from "@orpc/server";
import type {
	GenerateResponseInput,
	PromptSection,
	ToolContext,
} from "@repo/ai";
import {
	buildSystemPrompt,
	executeEscalationGuard,
	extractToolPromptOverrides,
	formatHistoryMessage,
	generateAgentResponse,
	resolveTools,
} from "@repo/ai";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

export async function handleWebChatMessage(
	token: string,
	sessionId: string,
	message: string,
): Promise<{ response: string }> {
	// Look up agent by webChatToken
	const agent = await db.aiAgent.findFirst({
		where: {
			webChatToken: token,
			webChatEnabled: true,
			enabled: true,
		},
	});

	if (!agent) {
		throw new ORPCError("NOT_FOUND", {
			message: "Agent not found or not available",
		});
	}

	// Truncate incoming message
	const truncatedText = message.slice(0, config.ai.maxMessageLength);

	// Find or create conversation (channelId is null for web chat)
	let conversation = await db.aiConversation.findFirst({
		where: {
			agentId: agent.id,
			channelId: null,
			externalChatId: sessionId,
		},
	});

	if (conversation) {
		conversation = await db.aiConversation.update({
			where: { id: conversation.id },
			data: { lastMessageAt: new Date() },
		});
	} else {
		conversation = await db.aiConversation.create({
			data: {
				agentId: agent.id,
				externalChatId: sessionId,
				lastMessageAt: new Date(),
				messageCount: 0,
			},
		});
	}

	// Store user message
	await db.aiMessage.create({
		data: {
			conversationId: conversation.id,
			role: "user",
			content: truncatedText,
		},
	});

	// Check AI messages quota
	const quotaResult = await checkAndIncrementQuota(
		{
			type: "organization",
			organizationId: agent.organizationId,
		},
		"aiMessages",
	);
	if (!quotaResult.allowed) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"This agent has reached its message limit. Please try again later.",
		});
	}

	// Load conversation history
	const history = await db.aiMessage.findMany({
		where: { conversationId: conversation.id },
		orderBy: { createdAt: "desc" },
		take: agent.maxHistoryLength,
		select: {
			role: true,
			content: true,
			toolCalls: true,
		},
	});

	// Reverse to chronological order
	const historyMessages = history.reverse().map(formatHistoryMessage);

	// Resolve tools if agent has any enabled
	let tools: GenerateResponseInput["tools"];
	const agentToolConfigs =
		agent.enabledTools.length > 0
			? await db.aiAgentToolConfig.findMany({
					where: { agentId: agent.id },
				})
			: [];

	if (agent.enabledTools.length > 0) {
		const perToolConfigs: Record<string, Record<string, unknown>> = {};
		for (const tc of agentToolConfigs) {
			perToolConfigs[tc.toolId] = tc.config as Record<string, unknown>;
		}

		const toolContext: ToolContext = {
			organizationId: agent.organizationId,
			agentId: agent.id,
			conversationId: conversation.id,
			externalChatId: sessionId,
		};
		tools = resolveTools(agent.enabledTools, toolContext, perToolConfigs);
	}

	// Build system prompt
	const systemPrompt = buildSystemPrompt({
		basePrompt: agent.systemPrompt,
		enabledTools: agent.enabledTools,
		maintenanceMode: agent.maintenanceMode,
		maintenanceMessage: agent.maintenanceMessage ?? undefined,
		isWebChat: true,
		promptSections: agent.promptSections as unknown as PromptSection[],
		toolPromptOverrides: extractToolPromptOverrides(agentToolConfigs),
	});

	// Generate AI response with timeout
	const timeoutMs = config.ai.responseTimeoutMs;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const result = await generateAgentResponse({
			model: agent.model,
			systemPrompt,
			knowledgeBase: agent.knowledgeBase ?? undefined,
			messages: historyMessages,
			temperature: agent.temperature,
			abortController: controller,
			tools,
			maxSteps: tools ? 10 : undefined,
		});

		clearTimeout(timeout);

		// Escalation safety net
		if (tools && agent.enabledTools.includes("escalate-telegram")) {
			const guardResult = await executeEscalationGuard({
				tools,
				responseText: result.text,
				toolResults: result.toolResults,
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

		// Store assistant message
		const messageData: Record<string, unknown> = {
			conversationId: conversation.id,
			role: "assistant",
			content: result.text,
			tokenCount: result.tokenCount,
			latencyMs: result.latencyMs,
		};
		if (result.toolResults) {
			messageData["toolCalls"] = JSON.parse(
				JSON.stringify(result.toolResults),
			);
		}
		await db.aiMessage.create({ data: messageData as never });

		// Update conversation counters
		await db.aiConversation.update({
			where: { id: conversation.id },
			data: {
				messageCount: { increment: 2 },
				lastMessageAt: new Date(),
			},
		});

		return { response: result.text };
	} catch (error: unknown) {
		clearTimeout(timeout);

		const errorName = error instanceof Error ? error.name : "";

		if (errorName === "AI_InvalidToolInputError") {
			const toolError = error as Error & { toolName?: string };
			logger.error("Web chat AI invalid tool input", {
				toolName: toolError.toolName,
				conversationId: conversation.id,
			});
		} else if (errorName === "AI_NoSuchToolError") {
			const toolError = error as Error & { toolName?: string };
			logger.error("Web chat AI tool not found", {
				toolName: toolError.toolName,
				conversationId: conversation.id,
			});
		} else {
			logger.error("Web chat AI generation failed", {
				error,
				conversationId: conversation.id,
			});
		}

		// Store error message
		await db.aiMessage.create({
			data: {
				conversationId: conversation.id,
				role: "assistant",
				content: FALLBACK_MESSAGE,
				error: error instanceof Error ? error.message : "Unknown error",
			},
		});

		await db.aiConversation.update({
			where: { id: conversation.id },
			data: {
				messageCount: { increment: 2 },
				lastMessageAt: new Date(),
			},
		});

		return { response: FALLBACK_MESSAGE };
	}
}

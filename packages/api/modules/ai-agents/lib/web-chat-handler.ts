import { ORPCError } from "@orpc/server";
import {
	assistantMessageToParts,
	buildAgentMessages,
	buildAgentTelemetry,
	executeEscalationGuard,
	extractToolPromptOverrides,
	generateAgentResponse,
	modelMessagesToRoleContent,
	type PromptSection,
	resolveAgentTools,
} from "@repo/ai";
import { config } from "@repo/config";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";
import { fetchServicePlansSection } from "./service-plans-context";

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

	const truncatedText = message.slice(0, config.ai.maxMessageLength);

	// Check quota BEFORE any writes so we don't strand a user message.
	const quotaResult = await checkAndIncrementQuota(
		{ type: "organization", organizationId: agent.organizationId },
		"aiMessages",
	);
	if (!quotaResult.allowed) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"This agent has reached its message limit. Please try again later.",
		});
	}

	// Find or create conversation.
	let conversation = await db.aiConversation.findFirst({
		where: {
			agentId: agent.id,
			channelId: null,
			externalChatId: sessionId,
		},
	});

	const previousLastMessageAt = conversation?.lastMessageAt ?? null;
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

	// Load history (already includes the user message we just stored)
	const history = await db.aiMessage.findMany({
		where: { conversationId: conversation.id },
		orderBy: { createdAt: "desc" },
		take: agent.maxHistoryLength,
		select: {
			role: true,
			content: true,
			toolCalls: true,
			parts: true,
		},
	});

	const historyRows = history.reverse();

	const { tools, agentToolConfigs } = await resolveAgentTools({
		agent,
		conversationId: conversation.id,
		externalChatId: sessionId,
	});

	const servicePlans = await fetchServicePlansSection(
		agent.organizationId,
		agent.servicePlansEnabled,
		agent.servicePlanIds,
	);

	const messages = buildAgentMessages({
		systemOptions: {
			basePrompt: agent.systemPrompt,
			enabledTools: agent.enabledTools,
			maintenanceMode: agent.maintenanceMode,
			maintenanceMessage: agent.maintenanceMessage ?? undefined,
			isWebChat: true,
			servicePlans,
			promptSections: agent.promptSections as unknown as PromptSection[],
			toolPromptOverrides: extractToolPromptOverrides(agentToolConfigs),
		},
		history: historyRows,
		lastMessageAt: previousLastMessageAt,
		contextGapThresholdMinutes: agent.contextGapThresholdMinutes,
	});

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		config.ai.responseTimeoutMs,
	);

	try {
		const result = await generateAgentResponse({
			model: agent.model,
			messages,
			temperature: agent.temperature,
			abortSignal: controller.signal,
			tools,
			telemetry: buildAgentTelemetry({
				conversationId: conversation.id,
				agentId: agent.id,
				organizationId: agent.organizationId,
			}),
		});

		clearTimeout(timeout);

		// Escalation safety net
		if (tools && agent.enabledTools.includes("escalate-telegram")) {
			const guardResult = await executeEscalationGuard({
				tools,
				responseText: result.text,
				toolResults: result.toolResults,
				conversationMessages: modelMessagesToRoleContent(messages),
				conversationId: conversation.id,
			});
			if (guardResult) {
				if (!result.toolResults) {
					result.toolResults = [];
				}
				result.toolResults.push(guardResult);
			}
		}

		const assistantParts = assistantMessageToParts(
			result.text,
			result.toolResults,
		);
		await db.aiMessage.create({
			data: {
				conversationId: conversation.id,
				role: "assistant",
				content: result.text,
				tokenCount: result.tokenCount,
				inputTokens: result.inputTokens,
				outputTokens: result.outputTokens,
				cacheReadTokens: result.cacheReadTokens,
				cacheWriteTokens: result.cacheWriteTokens,
				latencyMs: result.latencyMs,
				...(assistantParts.length > 0
					? { parts: assistantParts as Prisma.InputJsonValue }
					: {}),
			},
		});

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

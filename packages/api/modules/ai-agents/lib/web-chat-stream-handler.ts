import type { GenerateResponseInput, ToolContext } from "@repo/ai";
import {
	CUSTOMER_IDENTIFICATION_INSTRUCTION,
	createAgentStream,
	ESCALATION_TOOL_INSTRUCTION,
	LANGUAGE_MATCHING_INSTRUCTION,
	MAINTENANCE_MODE_INSTRUCTION,
	MULTI_ACCOUNT_SELECTION_INSTRUCTION,
	resolveTools,
	VERBOSE_TOOL_INSTRUCTION,
} from "@repo/ai";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";
import type { StreamChunk } from "@tanstack/ai";
import { toServerSentEventsResponse } from "@tanstack/ai";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

export async function handleWebChatStream(
	request: Request,
	token: string,
): Promise<Response> {
	// Parse request body — TanStack AI client sends { messages, data, ...body }
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid request body", { status: 400 });
	}

	// sessionId is sent at the top level of the body by fetchServerSentEvents
	const rawSessionId = body["sessionId"];
	const sessionId =
		typeof rawSessionId === "string" ? rawSessionId : crypto.randomUUID();

	// Extract last user message from the messages array
	const rawMessages = body["messages"];
	if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
		return new Response("No messages provided", { status: 400 });
	}

	const lastMessage = rawMessages[rawMessages.length - 1];
	let userText: string;

	if (typeof lastMessage === "object" && lastMessage !== null) {
		const msg = lastMessage as Record<string, unknown>;
		if (typeof msg["content"] === "string") {
			userText = msg["content"];
		} else if (Array.isArray(msg["parts"])) {
			const textPart = (
				msg["parts"] as Array<Record<string, unknown>>
			).find(
				(p) => p["type"] === "text" && typeof p["content"] === "string",
			);
			userText = (textPart?.["content"] as string) ?? "";
		} else {
			userText = "";
		}
	} else {
		userText = "";
	}

	if (!userText.trim()) {
		return new Response("Empty message", { status: 400 });
	}

	// Look up agent by webChatToken
	const agent = await db.aiAgent.findFirst({
		where: {
			webChatToken: token,
			webChatEnabled: true,
			enabled: true,
		},
	});

	if (!agent) {
		return new Response("Agent not found or not available", {
			status: 404,
		});
	}

	// Truncate incoming message
	const truncatedText = userText.slice(0, config.ai.maxMessageLength);

	// Find or create conversation
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
		return new Response(
			"This agent has reached its message limit. Please try again later.",
			{ status: 429 },
		);
	}

	// Load conversation history
	const history = await db.aiMessage.findMany({
		where: { conversationId: conversation.id },
		orderBy: { createdAt: "desc" },
		take: agent.maxHistoryLength,
		select: {
			role: true,
			content: true,
		},
	});

	const historyMessages = history.reverse().map((m) => ({
		role: (m.role === "admin" ? "assistant" : m.role) as
			| "user"
			| "assistant",
		content: m.content,
	}));

	// Resolve tools
	let tools: GenerateResponseInput["tools"];
	if (agent.enabledTools.length > 0) {
		const agentToolConfigs = await db.aiAgentToolConfig.findMany({
			where: { agentId: agent.id },
		});
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

	// Enhance system prompt for verbose tool narration + escalation
	let systemPrompt = agent.systemPrompt;
	if (agent.maintenanceMode && agent.maintenanceMessage) {
		systemPrompt += MAINTENANCE_MODE_INSTRUCTION(agent.maintenanceMessage);
	}
	systemPrompt += LANGUAGE_MATCHING_INSTRUCTION;
	if (tools) {
		systemPrompt += VERBOSE_TOOL_INSTRUCTION;
		if (agent.enabledTools.includes("escalate-telegram")) {
			systemPrompt += ESCALATION_TOOL_INSTRUCTION;
		}
		if (agent.enabledTools.includes("isp-search-customer")) {
			systemPrompt += CUSTOMER_IDENTIFICATION_INSTRUCTION;
			systemPrompt += MULTI_ACCOUNT_SELECTION_INSTRUCTION;
		}
	}

	// Stream the response
	const abortController = new AbortController();
	const timeoutMs = config.ai.responseTimeoutMs;
	const timeout = setTimeout(() => abortController.abort(), timeoutMs);

	const stream = createAgentStream({
		model: agent.model,
		systemPrompt,
		knowledgeBase: agent.knowledgeBase ?? undefined,
		messages: historyMessages,
		temperature: agent.temperature,
		abortController,
		tools,
		maxSteps: tools ? 10 : undefined,
	});

	// Wrap stream to capture completion data for DB storage
	const conversationId = conversation.id;

	async function* trackAndForward(): AsyncIterable<StreamChunk> {
		let text = "";
		let tokenCount = 0;
		const toolResults: Array<{
			toolName: string;
			args: unknown;
			result: unknown;
		}> = [];
		const start = Date.now();

		try {
			for await (const chunk of stream) {
				if (chunk.type === "TEXT_MESSAGE_CONTENT") {
					text += chunk.delta;
				} else if (chunk.type === "TOOL_CALL_END") {
					toolResults.push({
						toolName: chunk.toolName,
						args: chunk.input,
						result: chunk.result,
					});
				} else if (chunk.type === "RUN_FINISHED" && chunk.usage) {
					tokenCount =
						(chunk.usage.promptTokens ?? 0) +
						(chunk.usage.completionTokens ?? 0);
				}
				yield chunk;
			}

			clearTimeout(timeout);

			// Fire-and-forget: store result after stream ends
			const latencyMs = Date.now() - start;
			const messageData: Record<string, unknown> = {
				conversationId,
				role: "assistant",
				content: text,
				tokenCount,
				latencyMs,
			};
			if (toolResults.length > 0) {
				messageData["toolCalls"] = JSON.parse(
					JSON.stringify(toolResults),
				);
			}

			db.aiMessage.create({ data: messageData as never }).catch(() => {});
			db.aiConversation
				.update({
					where: { id: conversationId },
					data: {
						messageCount: { increment: 2 },
						lastMessageAt: new Date(),
					},
				})
				.catch(() => {});
		} catch (error) {
			clearTimeout(timeout);
			logger.error("Web chat stream completion failed", {
				error,
				conversationId,
			});

			// Store error message
			db.aiMessage
				.create({
					data: {
						conversationId,
						role: "assistant",
						content: FALLBACK_MESSAGE,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
				})
				.catch(() => {});

			db.aiConversation
				.update({
					where: { id: conversationId },
					data: {
						messageCount: { increment: 2 },
						lastMessageAt: new Date(),
					},
				})
				.catch(() => {});
		}
	}

	return toServerSentEventsResponse(trackAndForward(), { abortController });
}

import type {
	GenerateResponseInput,
	PromptSection,
	ToolContext,
	ToolResult,
} from "@repo/ai";
import {
	buildContextGapNote,
	buildSystemPrompt,
	createAgentStream,
	executeEscalationGuard,
	extractToolPromptOverrides,
	formatHistoryMessage,
	resolveTools,
} from "@repo/ai";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";
import { fetchServicePlansSection } from "./service-plans-context";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

export async function handleWebChatStream(
	request: Request,
	token: string,
): Promise<Response> {
	// Parse request body — AI SDK client sends { messages, data, ...body }
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid request body", { status: 400 });
	}

	// sessionId is sent at the top level of the body by the client
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
			toolCalls: true,
		},
	});

	const historyMessages = history.reverse().map(formatHistoryMessage);

	// Inject context gap note if significant time has passed
	const gapNote = buildContextGapNote(
		previousLastMessageAt,
		agent.contextGapThresholdMinutes,
	);
	if (gapNote && historyMessages.length > 0) {
		let insertIdx = historyMessages.length - 1;
		while (
			insertIdx > 0 &&
			historyMessages[insertIdx - 1]?.role === "user"
		) {
			insertIdx--;
		}
		historyMessages.splice(insertIdx, 0, {
			role: "user",
			content: gapNote,
		});
	}

	// Resolve tools
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

	// Fetch service plans section (if enabled)
	const servicePlans = await fetchServicePlansSection(
		agent.organizationId,
		agent.servicePlansEnabled,
	);

	// Build system prompt (streaming web chat needs verbose tool narration)
	const systemPrompt = buildSystemPrompt({
		basePrompt: agent.systemPrompt,
		enabledTools: agent.enabledTools,
		maintenanceMode: agent.maintenanceMode,
		maintenanceMessage: agent.maintenanceMessage ?? undefined,
		servicePlans,
		promptSections: agent.promptSections as unknown as PromptSection[],
		toolPromptOverrides: extractToolPromptOverrides(agentToolConfigs),
	});

	// Stream the response
	const abortController = new AbortController();
	const timeoutMs = config.ai.responseTimeoutMs;
	const timeout = setTimeout(() => abortController.abort(), timeoutMs);

	const streamResult = createAgentStream({
		model: agent.model,
		systemPrompt,
		knowledgeBase: agent.knowledgeBase ?? undefined,
		messages: historyMessages,
		temperature: agent.temperature,
		abortSignal: abortController.signal,
		tools,
		maxSteps: tools ? 10 : undefined,
	});

	// Fire-and-forget: track completion data from the stream for DB storage
	const conversationId = conversation.id;
	const streamStartTime = Date.now();

	Promise.resolve(streamResult.consumeStream())
		.then(async () => {
			clearTimeout(timeout);

			try {
				const [fullText, usage, toolResultsRaw] = await Promise.all([
					streamResult.text,
					streamResult.usage,
					streamResult.toolResults,
				]);

				const tokenCount =
					(usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

				const toolResults: ToolResult[] = Array.isArray(toolResultsRaw)
					? toolResultsRaw.map((tr) => ({
							toolName: tr.toolName,
							args: tr.input,
							result: tr.output,
						}))
					: [];

				// Escalation safety net
				if (tools && agent.enabledTools.includes("escalate-telegram")) {
					try {
						const guardResult = await executeEscalationGuard({
							tools,
							responseText: fullText,
							toolResults:
								toolResults.length > 0
									? toolResults
									: undefined,
							conversationMessages: historyMessages,
							conversationId,
						});
						if (guardResult) {
							toolResults.push(guardResult);
						}
					} catch {
						// Guard failure should not affect DB storage
					}
				}

				// Store assistant message
				const messageData: Record<string, unknown> = {
					conversationId,
					role: "assistant",
					content: fullText,
					tokenCount,
					latencyMs: Date.now() - streamStartTime,
				};
				if (toolResults.length > 0) {
					messageData["toolCalls"] = JSON.parse(
						JSON.stringify(toolResults),
					);
				}

				await db.aiMessage
					.create({ data: messageData as never })
					.catch((err) =>
						logger.error("Failed to store assistant message", {
							error: err,
							conversationId,
						}),
					);
				await db.aiConversation
					.update({
						where: { id: conversationId },
						data: {
							messageCount: { increment: 2 },
							lastMessageAt: new Date(),
						},
					})
					.catch((err) =>
						logger.error("Failed to update conversation counters", {
							error: err,
							conversationId,
						}),
					);
			} catch (error) {
				logger.error("Web chat stream completion failed", {
					error,
					conversationId,
				});

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
					.catch((err) =>
						logger.error("Failed to store fallback message", {
							error: err,
							conversationId,
						}),
					);

				db.aiConversation
					.update({
						where: { id: conversationId },
						data: {
							messageCount: { increment: 2 },
							lastMessageAt: new Date(),
						},
					})
					.catch((err) =>
						logger.error(
							"Failed to update conversation after error",
							{ error: err, conversationId },
						),
					);
			}
		})
		.catch((err) => {
			clearTimeout(timeout);
			logger.error("Web chat stream consumption failed", {
				error: err,
				conversationId,
			});
		});

	return streamResult.toUIMessageStreamResponse();
}

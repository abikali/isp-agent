import {
	buildAgentMessages,
	buildAgentTelemetry,
	createAgentStream,
	executeEscalationGuard,
	extractToolPromptOverrides,
	getToolName,
	isToolUIPart,
	modelMessagesToRoleContent,
	type PromptSection,
	resolveAgentTools,
	type ToolResult,
	type UIMessage,
} from "@repo/ai";
import { config } from "@repo/config";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";
import { fetchServicePlansSection } from "./service-plans-context";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

/**
 * Streaming web chat endpoint. Returns a UI-message SSE stream consumed by
 * `useChat` on the frontend.
 *
 * Persistence uses `toUIMessageStreamResponse`'s built-in `onFinish` callback
 * combined with `consumeSseStream` so the assistant message gets written to
 * the database even when the client disconnects mid-stream. The previous
 * implementation hand-rolled this with `consumeStream() + awaiting
 * streamResult.text/usage/toolResults` in a fire-and-forget chain, which
 * only captured the final step in a multi-step run and never received
 * abort/error signals from the SDK.
 */
export async function handleWebChatStream(
	request: Request,
	token: string,
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return new Response("Invalid request body", { status: 400 });
	}

	const rawSessionId = body["sessionId"];
	const sessionId =
		typeof rawSessionId === "string" ? rawSessionId : crypto.randomUUID();

	const rawMessages = body["messages"];
	if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
		return new Response("No messages provided", { status: 400 });
	}

	const userText = extractUserTextFromLastMessage(rawMessages);
	if (!userText.trim()) {
		return new Response("Empty message", { status: 400 });
	}

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

	// Check quota BEFORE any writes.
	const quotaResult = await checkAndIncrementQuota(
		{ type: "organization", organizationId: agent.organizationId },
		"aiMessages",
	);
	if (!quotaResult.allowed) {
		return new Response(
			"This agent has reached its message limit. Please try again later.",
			{ status: 429 },
		);
	}

	const truncatedText = userText.slice(0, config.ai.maxMessageLength);

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

	await db.aiMessage.create({
		data: {
			conversationId: conversation.id,
			role: "user",
			content: truncatedText,
		},
	});

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

	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort(),
		config.ai.responseTimeoutMs,
	);

	const streamStart = Date.now();
	const streamResult = createAgentStream({
		model: agent.model,
		messages,
		temperature: agent.temperature,
		abortSignal: abortController.signal,
		tools,
		telemetry: buildAgentTelemetry({
			conversationId: conversation.id,
			agentId: agent.id,
			organizationId: agent.organizationId,
		}),
	});

	const conversationId = conversation.id;
	const conversationModelMessages = messages;

	// Drain the model stream on the server side too — keeps the SDK pumping
	// tokens even after a client disconnect, so `onFinish` always fires.
	streamResult.consumeStream();

	return streamResult.toUIMessageStreamResponse({
		onFinish: async ({ messages: finishedMessages, isAborted }) => {
			clearTimeout(timeout);

			try {
				const assistantMessage =
					pickLatestAssistantMessage(finishedMessages);

				const { text: assistantText, toolResults } =
					extractTextAndToolResults(assistantMessage?.parts);

				// SDK-streamed parts already include the model's tool calls.
				// The escalation guard fires post-stream and may append a
				// guard-triggered tool result, which we fold into the parts
				// array so persistence captures it.
				const partsToStore: UIMessage["parts"] = assistantMessage?.parts
					? [...assistantMessage.parts]
					: [];

				if (tools && agent.enabledTools.includes("escalate-telegram")) {
					try {
						const guardResult = await executeEscalationGuard({
							tools,
							responseText: assistantText,
							toolResults:
								toolResults.length > 0
									? toolResults
									: undefined,
							conversationMessages: modelMessagesToRoleContent(
								conversationModelMessages,
							),
							conversationId,
						});
						if (guardResult) {
							partsToStore.push(
								toolResultToPart(guardResult, conversationId),
							);
						}
					} catch (err) {
						logger.error("Web chat escalation guard failed", {
							error: err,
							conversationId,
						});
					}
				}

				await db.aiMessage.create({
					data: {
						conversationId,
						role: "assistant",
						content: assistantText,
						latencyMs: Date.now() - streamStart,
						...(partsToStore.length > 0
							? { parts: partsToStore as Prisma.InputJsonValue }
							: {}),
						...(isAborted
							? { error: "client_aborted_before_finish" }
							: {}),
					},
				});

				await db.aiConversation.update({
					where: { id: conversationId },
					data: {
						messageCount: { increment: 2 },
						lastMessageAt: new Date(),
					},
				});
			} catch (error) {
				logger.error("Web chat stream onFinish persistence failed", {
					error,
					conversationId,
				});
			}
		},
		onError: (error) => {
			clearTimeout(timeout);
			logger.error("Web chat stream errored", { error, conversationId });
			return FALLBACK_MESSAGE;
		},
	});
}

function extractUserTextFromLastMessage(rawMessages: unknown[]): string {
	const last = rawMessages[rawMessages.length - 1];
	if (typeof last !== "object" || last === null) {
		return "";
	}
	const msg = last as Record<string, unknown>;
	if (typeof msg["content"] === "string") {
		return msg["content"];
	}
	if (Array.isArray(msg["parts"])) {
		const parts = msg["parts"] as Array<Record<string, unknown>>;
		const textPart = parts.find(
			(p) =>
				p["type"] === "text" &&
				(typeof p["content"] === "string" ||
					typeof p["text"] === "string"),
		);
		if (textPart) {
			const value = textPart["text"] ?? textPart["content"];
			if (typeof value === "string") {
				return value;
			}
		}
	}
	return "";
}

function pickLatestAssistantMessage(
	messages: UIMessage[],
): UIMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role === "assistant") {
			return m;
		}
	}
	return undefined;
}

function extractTextAndToolResults(parts: UIMessage["parts"] | undefined): {
	text: string;
	toolResults: ToolResult[];
} {
	if (!parts) {
		return { text: "", toolResults: [] };
	}
	const textChunks: string[] = [];
	const toolResults: ToolResult[] = [];
	for (const part of parts) {
		if (part.type === "text" && typeof part.text === "string") {
			textChunks.push(part.text);
			continue;
		}
		if (!isToolUIPart(part)) {
			continue;
		}
		if (part.state !== "output-available") {
			continue;
		}
		toolResults.push({
			toolCallId: part.toolCallId,
			toolName: getToolName(part),
			args: part.input,
			result: part.output,
		});
	}
	return { text: textChunks.join(""), toolResults };
}

function toolResultToPart(
	tr: ToolResult,
	conversationId: string,
): UIMessage["parts"][number] {
	return {
		type: `tool-${tr.toolName}`,
		toolCallId: tr.toolCallId ?? `guard-${conversationId}`,
		state: "output-available",
		input: tr.args ?? {},
		output: tr.result,
	} as UIMessage["parts"][number];
}

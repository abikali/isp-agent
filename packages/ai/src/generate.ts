import type { StreamChunk } from "@tanstack/ai";
import { generateText, stepCountIs, streamText } from "ai";
import { getModel } from "./model-registry";
import type { GenerateResponseInput, GenerateResponseResult } from "./types";

export const VERBOSE_TOOL_INSTRUCTION =
	"\n\nWhen using tools, briefly explain what you're about to do before calling each tool. After receiving results, analyze and present them clearly.";

export interface StreamAgentResponseResult {
	stream: AsyncIterable<StreamChunk>;
	completion: Promise<GenerateResponseResult>;
}

export async function generateAgentResponse(
	input: GenerateResponseInput,
): Promise<GenerateResponseResult> {
	const {
		model: modelId,
		systemPrompt,
		knowledgeBase,
		messages,
		temperature = 0.7,
		abortSignal,
		tools,
		maxSteps,
		onStepText,
	} = input;

	const model = getModel(modelId);

	let fullSystemPrompt = systemPrompt;
	if (knowledgeBase) {
		fullSystemPrompt = `${systemPrompt}\n\n--- Knowledge Base ---\n${knowledgeBase}`;
	}

	const start = Date.now();

	const result = await generateText({
		model,
		system: fullSystemPrompt,
		messages: messages.map((m) => ({
			role: m.role,
			content: m.content,
		})),
		temperature,
		...(abortSignal ? { abortSignal } : {}),
		...(tools ? { tools } : {}),
		...(maxSteps ? { stopWhen: stepCountIs(maxSteps) } : {}),
		...(onStepText
			? {
					onStepFinish: async (step) => {
						if (
							step.text.trim() &&
							step.finishReason === "tool-calls"
						) {
							await onStepText(step.text);
						}
					},
				}
			: {}),
	});

	const latencyMs = Date.now() - start;

	const tokenCount =
		(result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

	// Extract tool results from all steps
	const toolResults = result.steps
		?.flatMap((step) => step.toolResults ?? [])
		.map((tr) => ({
			toolName: tr.toolName,
			args: tr.input,
			result: tr.output,
		}));

	return {
		text: result.text,
		tokenCount,
		latencyMs,
		toolResults: toolResults?.length ? toolResults : undefined,
	};
}

export function streamAgentResponse(
	input: GenerateResponseInput,
): StreamAgentResponseResult {
	const {
		model: modelId,
		systemPrompt,
		knowledgeBase,
		messages,
		temperature = 0.7,
		abortSignal,
		tools,
		maxSteps,
	} = input;

	const model = getModel(modelId);

	let fullSystemPrompt = systemPrompt;
	if (knowledgeBase) {
		fullSystemPrompt = `${systemPrompt}\n\n--- Knowledge Base ---\n${knowledgeBase}`;
	}

	const start = Date.now();

	const result = streamText({
		model,
		system: fullSystemPrompt,
		messages: messages.map((m) => ({
			role: m.role,
			content: m.content,
		})),
		temperature,
		...(abortSignal ? { abortSignal } : {}),
		...(tools ? { tools } : {}),
		...(maxSteps ? { stopWhen: stepCountIs(maxSteps) } : {}),
	});

	let accumulatedContent = "";
	const chunkId = crypto.randomUUID();
	const modelName = modelId;

	async function* mapStream(): AsyncIterable<StreamChunk> {
		const toolCallArgs = new Map<string, string>();
		let toolCallIndex = 0;

		for await (const part of result.fullStream) {
			const timestamp = Date.now();

			if (part.type === "text-delta") {
				accumulatedContent += part.text;
				yield {
					type: "content",
					id: chunkId,
					model: modelName,
					timestamp,
					delta: part.text,
					content: accumulatedContent,
					role: "assistant",
				} satisfies StreamChunk;
			} else if (part.type === "tool-call") {
				const argsStr =
					typeof part.input === "string"
						? part.input
						: JSON.stringify(part.input);
				yield {
					type: "tool_call",
					id: chunkId,
					model: modelName,
					timestamp,
					toolCall: {
						id: part.toolCallId,
						type: "function",
						function: {
							name: part.toolName,
							arguments: argsStr,
						},
					},
					index: toolCallIndex++,
				} satisfies StreamChunk;
			} else if (part.type === "tool-result") {
				const contentStr =
					typeof part.output === "string"
						? part.output
						: JSON.stringify(part.output);
				yield {
					type: "tool_result",
					id: chunkId,
					model: modelName,
					timestamp,
					toolCallId: part.toolCallId,
					content: contentStr,
				} satisfies StreamChunk;
			} else if (part.type === "tool-input-delta") {
				const existing = toolCallArgs.get(part.id) ?? "";
				toolCallArgs.set(part.id, existing + part.delta);
			} else if (part.type === "reasoning-delta") {
				yield {
					type: "thinking",
					id: chunkId,
					model: modelName,
					timestamp,
					delta: part.text,
					content: part.text,
				} satisfies StreamChunk;
			} else if (part.type === "finish") {
				yield {
					type: "done",
					id: chunkId,
					model: modelName,
					timestamp,
					finishReason: mapFinishReason(part.finishReason),
					usage: {
						promptTokens: part.totalUsage?.inputTokens ?? 0,
						completionTokens: part.totalUsage?.outputTokens ?? 0,
						totalTokens:
							(part.totalUsage?.inputTokens ?? 0) +
							(part.totalUsage?.outputTokens ?? 0),
					},
				} satisfies StreamChunk;
			}
		}
	}

	const completion = (async (): Promise<GenerateResponseResult> => {
		const [text, totalUsage, steps] = await Promise.all([
			result.text,
			result.totalUsage,
			result.steps,
		]);

		const latencyMs = Date.now() - start;
		const tokenCount =
			(totalUsage?.inputTokens ?? 0) + (totalUsage?.outputTokens ?? 0);

		const toolResults = steps
			?.flatMap((step) => step.toolResults ?? [])
			.map((tr) => ({
				toolName: tr.toolName,
				args: tr.input,
				result: tr.output,
			}));

		return {
			text,
			tokenCount,
			latencyMs,
			toolResults: toolResults?.length ? toolResults : undefined,
		};
	})();

	return { stream: mapStream(), completion };
}

function mapFinishReason(
	reason: string,
): "stop" | "length" | "content_filter" | "tool_calls" | null {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
			return "length";
		case "content-filter":
			return "content_filter";
		case "tool-calls":
			return "tool_calls";
		default:
			return null;
	}
}

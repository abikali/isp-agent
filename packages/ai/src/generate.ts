import { type StopCondition, stepCountIs, streamText, type ToolSet } from "ai";
import { getModel } from "./model-registry";
import type {
	GenerateResponseInput,
	GenerateResponseResult,
	ToolResult,
} from "./types";

/** The return type of streamText(), used by consumers that handle the stream. */
export type AgentStreamResult = ReturnType<typeof streamText>;

const DEFAULT_MAX_STEPS = 20;

function resolveStopWhen(
	stopWhen: GenerateResponseInput["stopWhen"],
): StopCondition<ToolSet> | StopCondition<ToolSet>[] {
	if (!stopWhen) {
		return stepCountIs(DEFAULT_MAX_STEPS);
	}
	return stopWhen;
}

/**
 * Create a streaming chat response. The caller owns the full `messages` array
 * (system + history + new user message) and any cacheControl breakpoints on
 * provider options — this function does not transform messages, which would
 * defeat prompt caching.
 */
export function createAgentStream(
	input: GenerateResponseInput,
): AgentStreamResult {
	const model = getModel(input.model);

	return streamText({
		model,
		messages: input.messages,
		...(input.tools ? { tools: input.tools } : {}),
		stopWhen: resolveStopWhen(input.stopWhen),
		...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
		...(input.telemetry ? { experimental_telemetry: input.telemetry } : {}),
		...(input.prepareStep ? { prepareStep: input.prepareStep } : {}),
		...(input.activeTools ? { activeTools: input.activeTools } : {}),
		...(input.providerOptions
			? { providerOptions: input.providerOptions }
			: {}),
		temperature: input.temperature ?? 0,
	});
}

/**
 * Generate a complete AI response by consuming the streamText fullStream.
 * Used for non-streaming contexts (worker, non-streaming web chat).
 */
export async function generateAgentResponse(
	input: GenerateResponseInput,
): Promise<GenerateResponseResult> {
	const result = createAgentStream(input);
	const start = Date.now();

	let text = "";
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;
	const toolResults: ToolResult[] = [];

	for await (const chunk of result.fullStream) {
		if (chunk.type === "text-delta") {
			text += chunk.text;
		} else if (chunk.type === "tool-result") {
			toolResults.push({
				toolCallId: chunk.toolCallId,
				toolName: chunk.toolName,
				args: chunk.input,
				result: chunk.output,
			});
			input.onToolActivity?.();
		} else if (chunk.type === "tool-call") {
			input.onToolActivity?.();
			if (text.trim() && input.onStepText) {
				await input.onStepText(text);
				text = "";
			}
		} else if (chunk.type === "finish") {
			inputTokens = chunk.totalUsage?.inputTokens ?? 0;
			outputTokens = chunk.totalUsage?.outputTokens ?? 0;
			// AI SDK v6 surfaces cache token details under inputTokenDetails / providerMetadata
			const details = (
				chunk.totalUsage as unknown as {
					cachedInputTokens?: number;
				}
			)?.cachedInputTokens;
			if (typeof details === "number") {
				cacheReadTokens = details;
			}
		}
	}

	// Best-effort: pull cache metadata from finalised providerMetadata.
	try {
		const meta = (await result.providerMetadata) as
			| Record<string, Record<string, number | undefined> | undefined>
			| undefined;
		const anthropic = meta?.["anthropic"];
		if (anthropic) {
			const r = anthropic["cacheReadInputTokens"];
			const w = anthropic["cacheCreationInputTokens"];
			if (typeof r === "number") {
				cacheReadTokens = r;
			}
			if (typeof w === "number") {
				cacheWriteTokens = w;
			}
		}
		const openrouter = meta?.["openrouter"] as
			| { usage?: Record<string, number> }
			| undefined;
		if (openrouter?.usage) {
			const r = openrouter.usage["cacheReadTokens"];
			const w = openrouter.usage["cacheWriteTokens"];
			if (typeof r === "number") {
				cacheReadTokens = r;
			}
			if (typeof w === "number") {
				cacheWriteTokens = w;
			}
		}
	} catch {
		// providerMetadata may be unavailable on some providers — non-fatal.
	}

	return {
		text,
		tokenCount: inputTokens + outputTokens,
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		latencyMs: Date.now() - start,
		toolResults: toolResults.length > 0 ? toolResults : undefined,
	};
}

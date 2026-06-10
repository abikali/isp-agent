import { type StopCondition, stepCountIs, streamText, type ToolSet } from "ai";
import { getModel, usesProviderDefaultSampling } from "./model-registry";
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
	const model = getModel(input.model, { sessionId: input.sessionId });

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
		// Gemini 3.x degrades with non-default sampling params — let the
		// provider default apply instead of the agent's configured value.
		...(usesProviderDefaultSampling(input.model)
			? {}
			: { temperature: input.temperature ?? 0 }),
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
			// AI SDK v6 surfaces cache details under inputTokenDetails
			// (cachedInputTokens is the deprecated v5 name, kept as fallback).
			const usage = chunk.totalUsage as unknown as {
				cachedInputTokens?: number;
				inputTokenDetails?: {
					cacheReadTokens?: number;
					cacheWriteTokens?: number;
				};
			};
			const read =
				usage?.inputTokenDetails?.cacheReadTokens ??
				usage?.cachedInputTokens;
			if (typeof read === "number") {
				cacheReadTokens = read;
			}
			const write = usage?.inputTokenDetails?.cacheWriteTokens;
			if (typeof write === "number") {
				cacheWriteTokens = write;
			}
		}
	}

	// Best-effort: pull cache + cost metadata from finalised providerMetadata.
	let costUsd: number | undefined;
	try {
		const meta = (await result.providerMetadata) as
			| Record<string, Record<string, unknown> | undefined>
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
		// @openrouter/ai-sdk-provider usage shape: { promptTokens,
		// promptTokensDetails: { cachedTokens }, completionTokens, cost, ... }
		const openrouter = meta?.["openrouter"] as
			| {
					usage?: {
						cost?: number;
						promptTokensDetails?: {
							cachedTokens?: number;
							cacheWriteTokens?: number;
						};
					};
			  }
			| undefined;
		if (openrouter?.usage) {
			const details = openrouter.usage.promptTokensDetails;
			if (typeof details?.cachedTokens === "number") {
				cacheReadTokens = details.cachedTokens;
			}
			if (typeof details?.cacheWriteTokens === "number") {
				cacheWriteTokens = details.cacheWriteTokens;
			}
			if (typeof openrouter.usage.cost === "number") {
				costUsd = openrouter.usage.cost;
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
		costUsd,
		latencyMs: Date.now() - start,
		toolResults: toolResults.length > 0 ? toolResults : undefined,
	};
}

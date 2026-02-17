import type { StreamChunk } from "@tanstack/ai";
import { chat, maxIterations } from "@tanstack/ai";
import { getAdapter } from "./model-registry";
import type {
	GenerateResponseInput,
	GenerateResponseResult,
	ToolResult,
} from "./types";

export const VERBOSE_TOOL_INSTRUCTION =
	"\n\nWhen using tools, briefly explain what you're about to do before calling each tool. After receiving results, analyze and present them clearly.";

/**
 * Create a streaming chat response using TanStack AI's chat() function.
 * Returns an AsyncIterable<StreamChunk> that can be:
 * - Passed directly to toServerSentEventsResponse() for web chat streaming
 * - Consumed with for-await-of for non-streaming use cases
 */
export function createAgentStream(
	input: GenerateResponseInput,
): AsyncIterable<StreamChunk> {
	const adapter = getAdapter(input.model);

	let systemPrompt = input.systemPrompt;
	if (input.knowledgeBase) {
		systemPrompt = `${systemPrompt}\n\n--- Knowledge Base ---\n${input.knowledgeBase}`;
	}

	return chat({
		adapter,
		messages: input.messages,
		tools: input.tools,
		systemPrompts: [systemPrompt],
		agentLoopStrategy: input.maxSteps
			? maxIterations(input.maxSteps)
			: undefined,
		temperature: input.temperature ?? 0.7,
		abortController: input.abortController,
	});
}

/**
 * Generate a complete AI response by consuming the chat stream.
 * Used for non-streaming contexts (webhooks, workers, non-streaming web chat).
 */
export async function generateAgentResponse(
	input: GenerateResponseInput,
): Promise<GenerateResponseResult> {
	const stream = createAgentStream(input);
	const start = Date.now();

	let text = "";
	let totalTokens = 0;
	const toolResults: ToolResult[] = [];

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
			totalTokens =
				(chunk.usage.promptTokens ?? 0) +
				(chunk.usage.completionTokens ?? 0);
		} else if (
			chunk.type === "TOOL_CALL_START" &&
			text.trim() &&
			input.onStepText
		) {
			// Fire intermediate text callback before tool execution
			await input.onStepText(text);
		}
	}

	return {
		text,
		tokenCount: totalTokens,
		latencyMs: Date.now() - start,
		toolResults: toolResults.length > 0 ? toolResults : undefined,
	};
}

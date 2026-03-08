import { stepCountIs, streamText } from "ai";
import { getModel } from "./model-registry";
import type {
	GenerateResponseInput,
	GenerateResponseResult,
	ToolResult,
} from "./types";

/** The return type of streamText(), used by consumers that handle the stream. */
export type AgentStreamResult = ReturnType<typeof streamText>;

/**
 * Create a streaming chat response using AI SDK's streamText().
 * Returns the streamText result which can be consumed as a stream or awaited.
 */
export function createAgentStream(
	input: GenerateResponseInput,
): AgentStreamResult {
	const model = getModel(input.model);

	// Inject current time at the top so the model can reason about dates/expiry/schedules
	let system = `Current date and time: ${new Date().toISOString()}\n\n${input.systemPrompt}`;

	// Knowledge base goes after all instructions (reference material, not behavioral rules)
	if (input.knowledgeBase) {
		system = `${system}\n\n--- Knowledge Base ---\n${input.knowledgeBase}`;
	}

	return streamText({
		model,
		system,
		messages: input.messages.map((m) => ({
			role: m.role,
			content: m.content,
		})),
		...(input.tools ? { tools: input.tools } : {}),
		...(input.maxSteps ? { stopWhen: stepCountIs(input.maxSteps) } : {}),
		...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
		temperature: input.temperature ?? 0.3,
	});
}

/**
 * Generate a complete AI response by consuming the streamText fullStream.
 * Used for non-streaming contexts (webhooks, workers, non-streaming web chat).
 */
export async function generateAgentResponse(
	input: GenerateResponseInput,
): Promise<GenerateResponseResult> {
	const result = createAgentStream(input);
	const start = Date.now();

	let text = "";
	let totalTokens = 0;
	const toolResults: ToolResult[] = [];

	for await (const chunk of result.fullStream) {
		if (chunk.type === "text-delta") {
			text += chunk.text;
		} else if (chunk.type === "tool-result") {
			toolResults.push({
				toolName: chunk.toolName,
				args: chunk.input,
				result: chunk.output,
			});
			input.onToolActivity?.();
		} else if (chunk.type === "tool-call") {
			input.onToolActivity?.();
			if (text.trim() && input.onStepText) {
				// Fire intermediate text callback before tool execution
				await input.onStepText(text);
				// Reset so result.text only contains text after the last tool call
				text = "";
			}
		} else if (chunk.type === "finish") {
			totalTokens =
				(chunk.totalUsage?.inputTokens ?? 0) +
				(chunk.totalUsage?.outputTokens ?? 0);
		}
	}

	return {
		text,
		tokenCount: totalTokens,
		latencyMs: Date.now() - start,
		toolResults: toolResults.length > 0 ? toolResults : undefined,
	};
}

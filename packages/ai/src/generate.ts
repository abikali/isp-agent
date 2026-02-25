import type { StreamChunk } from "@tanstack/ai";
import { chat, maxIterations } from "@tanstack/ai";
import { getAdapter } from "./model-registry";
import type {
	GenerateResponseInput,
	GenerateResponseResult,
	ToolResult,
} from "./types";

export const ESCALATION_TOOL_INSTRUCTION =
	"\n\nYou have an escalation tool (escalate-telegram) available. Use it when: (1) you cannot resolve the issue after running all available diagnostics, (2) the customer explicitly asks to speak to a human or requests escalation, (3) you confirm an infrastructure-wide outage via cross-check pings, (4) the issue involves billing, account changes, or hardware problems outside your tool scope. ALWAYS complete your full diagnostic chain BEFORE escalating — never escalate without investigating first. When the customer explicitly asks for a human, comply immediately but still include your diagnostic findings in the summary. Set priority: high for outages/critical, medium for unresolved technical issues, low for general human-assistance requests. After escalating, tell the customer their issue has been forwarded to the support team with all diagnostic details.";

export const VERBOSE_TOOL_INSTRUCTION =
	"\n\nWhen using tools, briefly explain what you're about to do before calling each tool. After receiving results, read the actual field values carefully before reporting them — never misstate what the data shows. IMPORTANT: After isp-search-customer, FIRST check if active is false, blocked is true, or expiryAccount is in the past. If so, that is the diagnosis — tell the customer directly. If the account is eligible, continue the full diagnostic chain (ping, bandwidth, cross-check AP users). Never stop after a single tool call. Do NOT ask the customer for permission to continue diagnosing. Do NOT call isp-search-customer twice for the same user — the accessPointUsers list is already in the first result.";

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

	// Inject current time so the model can reason about dates/expiry/schedules
	systemPrompt = `${systemPrompt}\n\nCurrent date and time: ${new Date().toISOString()}`;

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
			// Reset so result.text only contains text after the last tool call
			text = "";
		}
	}

	return {
		text,
		tokenCount: totalTokens,
		latencyMs: Date.now() - start,
		toolResults: toolResults.length > 0 ? toolResults : undefined,
	};
}

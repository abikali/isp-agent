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

export const CUSTOMER_IDENTIFICATION_INSTRUCTION =
	'\n\nCUSTOMER IDENTIFICATION: When you search for a customer using isp-search-customer and they are NOT found, do NOT treat this as an error or a dead end. Instead: (1) Ask if they might be registered under a different phone number, username, or name. (2) If a second search still returns no match, they are a NEW potential subscriber — escalate immediately via escalate-telegram with priority "medium", including their name (from the WhatsApp contact info), phone number, and a summary of what they were asking about so the sales/support team has full context. (3) Tell the customer: "I couldn\'t find an account linked to your number. I\'ve forwarded your details to our team — someone will reach out to you shortly to help get you set up." Do NOT ask the customer to call or visit — the team will contact them.';

export const LANGUAGE_MATCHING_INSTRUCTION =
	'\n\nLANGUAGE MATCHING: Always reply in the same language the customer is using. If the customer writes in Arabic (العربية), reply in Arabic. If the customer writes in "Arabizi" / Franco-Arabic (Arabic written in Latin characters, e.g. "mar7aba", "kifak", "shu akhbarak", "meche el hal"), recognize this as Arabic and reply in Arabic script (العربية). If they write in English, reply in English. If they write in French, reply in French. Never switch to a different language unless the customer does first.';

export const MAINTENANCE_MODE_INSTRUCTION = (message: string) =>
	`\n\nIMPORTANT — MAINTENANCE MODE ACTIVE: The admin has flagged a known issue. Here is their internal note (do NOT repeat it verbatim to customers): "${message}". Guidelines: (1) If a customer reports a problem that could be related to this issue, acknowledge their concern empathetically and explain the situation in your own words. (2) Do NOT parrot the admin's message word-for-word — rephrase naturally. (3) If the admin's note includes an estimated resolution time, you may share it; otherwise do NOT speculate on when it will be fixed. (4) If a customer asks about something completely unrelated to the known issue, help them normally — maintenance mode only applies to the flagged problem. (5) Remain helpful, calm, and reassuring throughout.`;

export const MULTI_ACCOUNT_SELECTION_INSTRUCTION =
	'\n\nMULTIPLE ACCOUNTS — SELECTION HANDLING: When isp-search-customer returns multiple matches (multipleMatches: true), present each account clearly with: full name (firstName + lastName), userName, and address (if available). When the customer responds to pick an account, you MUST match their reply to the correct account from the PREVIOUS tool result and use the EXACT "userName" value from that result to call isp-search-customer again. NEVER search using the customer\'s raw reply text — customers often type approximate names, concatenated words, or partial matches. For example, if the results contained userName "acc" for customer "acc jhonny", and the customer replies "accjhonny" or "acc johnny" or "the first one", you must search using "acc" (the exact userName from the results). Always fuzzy-match the customer\'s reply against the names and usernames in your previous results to find the best match.';

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

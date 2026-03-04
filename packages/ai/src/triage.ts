import { logger } from "@repo/logs";
import { z } from "zod";
import { classifyText } from "./classify";

export interface TriageInput {
	lastAssistantResponse: string;
	bufferedMessages: string[];
	recentUserMessage: string;
}

export type TriageDecision = "respond" | "skip" | "acknowledge";

export interface TriageResult {
	decision: TriageDecision;
	message?: string | undefined;
}

const triageSchema = z.object({
	decision: z.enum(["skip", "acknowledge", "respond"]),
	message: z.string().optional(),
});

const TRIAGE_SYSTEM_PROMPT = `You are a message triage system for a customer support AI agent at an ISP.

You will receive buffered messages that arrived while the AI was already generating a response, along with context about the original question and last assistant response.

Classify the buffered messages into one of three categories:

- "skip": The messages are impatient pings (like "???", "hello?", ".", "هلو", "allo?"), duplicates of the original question, or noise that doesn't need a response.

- "acknowledge": The customer EXPLICITLY abandons the conversation with clear dismissal phrases like "never mind", "forget it", "خلص", "laisse tomber", "ok bye", "no thanks I'll call later". The customer must clearly indicate they no longer want ANY help. Include a brief polite acknowledgment message in the same language the customer used.

- "respond": The messages contain ANY substantive content — additional information, clarification of their request, a new question, corrections, or anything that adds context to the conversation. When in doubt, ALWAYS choose "respond".

IMPORTANT: Messages that clarify or reinforce the customer's original request are ALWAYS "respond", not "acknowledge". For example:
- "ma bade jadid" (I don't want a new one) after asking to cancel → "respond" (clarifying they want cancellation, not a new plan)
- "bas wa2efle" (just stop it for me) → "respond" (reinforcing the request)
- "la2 merci" (no thanks) in response to an offer → "respond" (declining an offer, not abandoning the conversation)

Only use "acknowledge" when the customer clearly wants to END the conversation entirely.

When deciding "acknowledge", set the "message" field to a brief polite reply in the customer's language. For example:
- Arabic: "تمام، أنا هون إذا بتحتاج شي."
- French: "D'accord, n'hésitez pas si vous avez besoin d'aide."
- English: "Understood, let me know if you need anything else."`;

export async function triageBufferedMessages(
	input: TriageInput,
): Promise<TriageResult> {
	const userPrompt = [
		`Original question: ${input.recentUserMessage}`,
		`Last assistant response: ${input.lastAssistantResponse}`,
		`Buffered messages:\n${input.bufferedMessages.map((m, i) => `${i + 1}. ${m}`).join("\n")}`,
	].join("\n\n");

	const result = await classifyText({
		systemPrompt: TRIAGE_SYSTEM_PROMPT,
		userPrompt,
		schema: triageSchema,
	});

	if (!result) {
		// LLM call failed — default to respond (never silently drop messages)
		logger.warn("Triage LLM call failed, defaulting to respond");
		return { decision: "respond" };
	}

	if (result.decision === "skip") {
		logger.info("Triage: skipping noise messages", {
			count: input.bufferedMessages.length,
		});
	} else if (result.decision === "acknowledge") {
		logger.info("Triage: acknowledging cancellation");
	}

	return {
		decision: result.decision,
		message: result.message,
	};
}

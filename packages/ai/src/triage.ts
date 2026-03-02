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

- "acknowledge": The customer wants to cancel, stop, or dismiss their request (like "never mind", "forget it", "خلص", "laisse tomber"). Include a brief polite acknowledgment message in the same language the customer used.

- "respond": The messages contain a genuinely new question, additional information, or a request not covered by the last assistant response. This needs a full AI response.

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

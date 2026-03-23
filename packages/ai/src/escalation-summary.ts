import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel } from "./model-registry";

export const escalationSummarySchema = z.object({
	summary: z
		.string()
		.describe(
			"2-3 sentence summary of the customer's issue, what was investigated, and current status. Written for a human support agent reading on their phone.",
		),
	priority: z
		.enum(["low", "medium", "high"])
		.describe(
			"low = general inquiry or info request. medium = sales lead, unresolved tech issue, plan change. high = outage, service down, angry customer, explicit transfer request.",
		),
	category: z
		.enum([
			"installation",
			"maintenance",
			"repair",
			"support",
			"billing",
			"general",
		])
		.describe(
			"installation = new setup, maintenance = scheduled work, repair = broken equipment/line, support = general tech, billing = payment/invoice, general = other.",
		),
	actionRequired: z
		.string()
		.describe(
			"One concrete sentence: what the team should do next. E.g. 'Dispatch technician to check physical connection' or 'Call customer to discuss available fiber plans'.",
		),
});

export type EscalationSummary = z.infer<typeof escalationSummarySchema>;

const SYSTEM_PROMPT = `You are a triage assistant for an ISP support team. Given a conversation between a customer and an AI agent, produce a structured escalation summary.

Rules:
- "summary": 2-3 sentences max. State what the customer reported, what the agent found (diagnostics, lookups), and why this needs human attention.
- "priority": high = service outage, customer offline, customer explicitly asked for human, critical issue. medium = sales inquiry, unresolved technical issue, plan change, cancellation request. low = general question, information request.
- "category": pick the single best fit.
- "actionRequired": one specific instruction for the team. Be concrete.
- Write everything in English regardless of the conversation language.
- Do NOT include raw message transcripts in the summary.`;

interface SummarizeInput {
	conversationMessages: Array<{ role: string; content: string }>;
	customerName?: string | undefined;
	customerPhone?: string | undefined;
	/** If the AI agent already provided args (direct tool call), include as hints */
	agentHints?:
		| {
				reason?: string | undefined;
				summary?: string | undefined;
				priority?: string | undefined;
				category?: string | undefined;
				actionRequired?: string | undefined;
		  }
		| undefined;
}

/**
 * Call a fast LLM to produce a structured escalation summary from conversation history.
 * Follows the same pattern as `classifyText` — returns null on any failure, never throws.
 */
export async function summarizeForEscalation(
	input: SummarizeInput,
): Promise<EscalationSummary | null> {
	const model = "gpt-4.1-nano";
	const timeoutMs = 8000;

	const abortController = new AbortController();
	const timer = setTimeout(() => abortController.abort(), timeoutMs);

	try {
		const recent = input.conversationMessages.slice(-15);
		const transcript = recent
			.map(
				(m) =>
					`${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`,
			)
			.join("\n");

		let userPrompt = `Customer: ${input.customerName ?? "Unknown"}`;
		if (input.customerPhone) {
			userPrompt += ` (${input.customerPhone})`;
		}
		userPrompt += `\n\nConversation:\n${transcript}`;

		if (input.agentHints?.reason) {
			userPrompt += `\n\nAgent's stated reason: ${input.agentHints.reason}`;
		}
		if (input.agentHints?.summary) {
			userPrompt += `\nAgent's summary: ${input.agentHints.summary.slice(0, 500)}`;
		}

		userPrompt += "\n\nRespond in JSON.";

		const result = await generateText({
			model: getModel(model),
			system: SYSTEM_PROMPT,
			messages: [{ role: "user", content: userPrompt }],
			output: Output.object({ schema: escalationSummarySchema }),
			temperature: 0,
			abortSignal: abortController.signal,
		});

		return (result.output ?? null) as EscalationSummary | null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

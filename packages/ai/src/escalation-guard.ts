import { logger } from "@repo/logs";
import { z } from "zod";
import { classifyText } from "./classify";
import { summarizeForEscalation } from "./escalation-summary";
import type { ToolRecord, ToolResult } from "./types";

interface EscalationToolOutput {
	success: boolean;
	message: string;
}

const escalationSchema = z.object({
	promisedEscalation: z.boolean(),
});

const ESCALATION_SYSTEM_PROMPT = `You are analyzing a customer support agent's response message.

Determine whether the agent COMMITTED to forwarding, escalating, or referring the customer's issue to a human team member — either as already done OR as an unconditional immediate action.

Return true if the agent:
- Says it ALREADY DID the escalation — e.g. "I've forwarded your request", "I've escalated this", "تم تحويل طلبك", "لقد قمت بتحويل طلبك", "j'ai transféré votre demande", "بلغت الفريق"
- Promises IMMEDIATE unconditional escalation — e.g. "I will forward your case now", "Let me escalate this", "I'm forwarding this to the team", "رح بلّغ الفريق هلق", "someone from our team will contact you", "سيتواصل معك أحد زملائنا"

Return false for:
- Offers or questions about escalating ("would you like me to forward?", "بتحب حوّل طلبك؟", "فيني حوّل طلبك")
- Conditional statements ("if you want, I can escalate", "أي سرعة بتفضل لخبر فريق المبيعات")
- Future intentions that depend on customer response ("I'll forward once you confirm", "رح حوّل إذا بتريد")
- General helpfulness or diagnostic answers
- Technical terms like "port forwarding"
- Past tense descriptions of someone else's actions ("the team fixed it")
- Anything that is merely an offer, question, or conditional — not a commitment`;

/**
 * Detect whether the model's response text indicates it intended to escalate
 * but did not actually call the escalate-telegram tool.
 */
export async function detectMissedEscalation(
	responseText: string,
	toolResults?: ToolResult[],
): Promise<boolean> {
	if (toolResults?.some((tr) => tr.toolName === "escalate-telegram")) {
		return false;
	}

	if (!responseText.trim()) {
		return false;
	}

	const result = await classifyText({
		systemPrompt: ESCALATION_SYSTEM_PROMPT,
		userPrompt: responseText,
		schema: escalationSchema,
	});

	return result?.promisedEscalation ?? false;
}

interface EscalationGuardOptions {
	tools: ToolRecord;
	responseText: string;
	toolResults?: ToolResult[] | undefined;
	customerName?: string | undefined;
	customerPhone?: string | undefined;
	conversationMessages: Array<{ role: string; content: string }>;
	conversationId: string;
}

/**
 * Build a minimal fallback summary when the LLM summarizer fails.
 */
function buildFallbackSummary(opts: EscalationGuardOptions): string {
	const recentUserMessages = opts.conversationMessages
		.filter((m) => m.role === "user")
		.slice(-3)
		.map((m) => m.content.slice(0, 200))
		.join("\n");

	const displayName = opts.customerName ?? "Unknown";
	return `Customer: ${displayName}\n\nRecent messages:\n${recentUserMessages}`;
}

/**
 * Post-generation safety net: if the model said it would escalate but didn't
 * call the tool, directly invoke the escalate-telegram tool's execute function.
 *
 * Uses the LLM summarizer to produce proper priority, category, and summary
 * instead of hardcoded values.
 *
 * Returns the tool result if escalation was triggered, or null if not needed.
 */
export async function executeEscalationGuard(
	opts: EscalationGuardOptions,
): Promise<ToolResult | null> {
	if (!(await detectMissedEscalation(opts.responseText, opts.toolResults))) {
		return null;
	}

	const escalateTool = opts.tools["escalate-telegram"];
	if (!escalateTool?.execute) {
		return null;
	}

	// Use LLM to produce a proper summary, priority, and category
	const llmSummary = await summarizeForEscalation({
		conversationMessages: opts.conversationMessages,
		customerName: opts.customerName,
		customerPhone: opts.customerPhone,
	});

	const args = {
		reason:
			llmSummary?.actionRequired ??
			"Customer request requiring human follow-up",
		priority: (llmSummary?.priority ?? "medium") as
			| "low"
			| "medium"
			| "high",
		summary: llmSummary?.summary ?? buildFallbackSummary(opts),
		customerName: opts.customerName,
		category: (llmSummary?.category ?? "support") as
			| "installation"
			| "maintenance"
			| "repair"
			| "support"
			| "billing"
			| "general",
		actionRequired: llmSummary?.actionRequired,
	};

	try {
		logger.warn(
			"Escalation guard triggered — model promised escalation but did not call tool",
			{
				conversationId: opts.conversationId,
				responsePreview: opts.responseText.slice(0, 200),
			},
		);

		const result = (await escalateTool.execute(args, {
			toolCallId: `guard-${opts.conversationId}`,
			messages: [],
			abortSignal: AbortSignal.timeout(30000),
		})) as EscalationToolOutput;

		if (!result.success) {
			logger.error(
				"Escalation guard: forced tool call returned failure",
				{
					conversationId: opts.conversationId,
					toolMessage: result.message,
				},
			);
		}

		return {
			toolName: "escalate-telegram",
			args,
			result,
		};
	} catch (error) {
		logger.error("Escalation guard failed to execute tool", {
			error,
			conversationId: opts.conversationId,
		});
		return null;
	}
}

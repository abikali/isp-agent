import { logger } from "@repo/logs";
import { z } from "zod";
import { classifyText } from "./classify";
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
	// If the tool was already called, no missed escalation
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

	// Fallback: if LLM call failed, default to false (don't trigger guard)
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
 * Post-generation safety net: if the model said it would escalate but didn't
 * call the tool, directly invoke the escalate-telegram tool's execute function.
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

	// Build a summary from recent user messages
	const recentUserMessages = opts.conversationMessages
		.filter((m) => m.role === "user")
		.slice(-5)
		.map((m) => m.content)
		.join("\n");

	const displayName = opts.customerName ?? "Unknown";
	const phone = opts.customerPhone ? ` (${opts.customerPhone})` : "";

	const args = {
		reason: "Customer request requiring human follow-up (auto-detected)",
		priority: "medium" as const,
		summary:
			`Customer: ${displayName}${phone}\n\n` +
			`Recent messages:\n${recentUserMessages}\n\n` +
			`Agent response: ${opts.responseText.slice(0, 500)}`,
		customerName: opts.customerName,
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
				"Escalation guard: forced tool call returned failure — Telegram message was NOT sent",
				{
					conversationId: opts.conversationId,
					toolMessage: result.message,
				},
			);
		} else {
			logger.info("Escalation guard: forced escalation succeeded", {
				conversationId: opts.conversationId,
			});
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

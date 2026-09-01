import { logger } from "@repo/logs";
import { z } from "zod";
import { hasToolNarration } from "./chat-formatting";
import { classifyText } from "./classify";
import { summarizeForEscalation } from "./escalation-summary";
import type { ToolRecord, ToolResult } from "./types";

interface EscalationToolOutput {
	success: boolean;
	message: string;
}

const escalationSchema = z.object({
	promisedEscalation: z.boolean(),
	// Defaulted, not required: classifyText runs the schema through
	// Output.object and returns null on any validation failure. A classifier
	// that omits this field would otherwise disable the whole guard rather
	// than just this one signal.
	claimedTeamAware: z.boolean().default(false),
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
- Anything that is merely an offer, question, or conditional — not a commitment

SEPARATELY, set claimedTeamAware to true when the agent tells the customer that the
team ALREADY KNOWS about the problem, is watching it, or is working on it — regardless
of who is said to have reported it, and regardless of tense. Examples:
- "we are already aware of the issue", "the team is following up on it"
- "صرنا على علم بالمشكلة", "الشباب عم يتابعوا الوضع", "الفريق التقني عم يشتغل عليها"
- "on est déjà au courant", "l'équipe suit le problème"
- "it is being handled from our side", "المشكلة عم تتعالج من عنا"

The agent has NO way to know the team is aware unless it escalated. So this claim is a
CLAIM OF AN ESCALATION, not a description of someone else's action — set it true even
though promisedEscalation is false. Set claimedTeamAware to false for a plain diagnosis
with no assertion about the team ("there is packet loss in your area"), for advice
("restart your router"), and for offers to notify the team.`;

/**
 * Multilingual keyword filter — short-circuits the expensive LLM classify
 * call. If the response text contains NONE of these tokens, the model almost
 * certainly didn't promise to escalate, so we skip the round-trip entirely.
 *
 * The classifier still runs on positive matches because keywords alone over-
 * fire: "I will *not* forward your case" matches, "port forwarding" matches,
 * "the team already handled it" doesn't.
 */
const ESCALATION_KEYWORD_RE = new RegExp(
	[
		"forward",
		"escal",
		"transfer",
		"notif",
		"inform",
		"send",
		"sent",
		"relay",
		"handed",
		"refer",
		"follow up",
		"follow-up",
		"pass",
		"contact",
		"reach out",
		"reach back",
		"get back",
		"reach you",
		"someone",
		"team",
		"colleague",
		"تحويل",
		"حوّل",
		"حول",
		"بلّغ",
		"بلغ",
		"أبلغ",
		"إبلاغ",
		"بنبلغ",
		"أنقل",
		"بنحوّل",
		"بحوّل",
		"نقلت",
		"حوّلت",
		"سيتواصل",
		"سنتواصل",
		"يتواصل",
		"تواصل",
		"التواصل",
		"إرسال",
		"أرسل",
		"يعود",
		"شخص",
		"فريق",
		"يتابع",
		"متابعة",
		"transfér",
		"équipe",
		"signal",
		"rappel",
		"revenir",
		"contacter",
		"recontact",
		"quelqu'un",
		"reviendrons",
	].join("|"),
	"i",
);

/**
 * Detect whether the model's response text indicates it intended to escalate
 * but did not actually call the escalate-telegram tool.
 *
 * Two-stage detection:
 *   1. Cheap regex pre-filter for escalation-related keywords across EN/AR/FR.
 *   2. Only when the regex matches, an LLM classifier decides whether the
 *      mention is a COMMITMENT (e.g. "I've forwarded your request") versus
 *      an OFFER ("would you like me to forward?") or a NEGATION ("I won't
 *      forward").
 *
 * On a typical run the regex misses, so the LLM round-trip is skipped.
 */
export async function detectMissedEscalation(
	responseText: string,
	toolResults?: ToolResult[],
): Promise<boolean> {
	if (toolResults?.some((tr) => tr.toolName === "escalate-telegram")) {
		return false;
	}

	const text = responseText.trim();
	if (text.length < 12) {
		return false;
	}

	if (!ESCALATION_KEYWORD_RE.test(text)) {
		return false;
	}

	const result = await classifyText({
		systemPrompt: ESCALATION_SYSTEM_PROMPT,
		userPrompt: text,
		schema: escalationSchema,
	});

	// Both are assertions of an escalation the model never made: it either said
	// it would forward the issue, or told the customer the team already knows.
	return (
		(result?.promisedEscalation ?? false) ||
		(result?.claimedTeamAware ?? false)
	);
}

/**
 * Deterministic trigger, independent of anything the model wrote: the
 * diagnostic tool proved a fault the customer cannot fix themselves.
 *
 * This is the trigger that does not depend on the model behaving. A confirmed
 * disconnection, or an unstable line with a degraded peer, is a job for a
 * human whatever the reply said — including when the model reassured the
 * customer and fell silent, or narrated the tool call instead of making it.
 */
export function detectDiagnosedFault(toolResults?: ToolResult[]): boolean {
	if (!toolResults) {
		return false;
	}
	return toolResults.some(
		(tr) =>
			tr.toolName === "isp-diagnose-customer" &&
			typeof tr.result === "object" &&
			tr.result !== null &&
			(tr.result as { needsHumanFollowUp?: unknown })
				.needsHumanFollowUp === true,
	);
}

/**
 * Window in which an existing escalation on this conversation makes a
 * guard-forced one redundant. The tool itself dedups Telegram sends over 10
 * minutes; this wider window stops a multi-hour outage from filing a fresh
 * task on every message the customer sends about it.
 */
const RECENT_ESCALATION_WINDOW_MS = 6 * 60 * 60 * 1000;

async function hasRecentEscalation(conversationId: string): Promise<boolean> {
	try {
		const { db } = await import("@repo/database");
		const existing = await db.task.findFirst({
			where: {
				conversationId,
				source: "AI_ESCALATION",
				createdAt: {
					gte: new Date(Date.now() - RECENT_ESCALATION_WINDOW_MS),
				},
			},
			select: { id: true },
		});
		return existing !== null;
	} catch (error) {
		// Never let a lookup failure suppress an escalation — a duplicate task
		// is recoverable, a dropped fault report is not.
		logger.error("Escalation guard: recent-escalation lookup failed", {
			error,
			conversationId,
		});
		return false;
	}
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
	const alreadyEscalated = opts.toolResults?.some(
		(tr) => tr.toolName === "escalate-telegram",
	);
	if (alreadyEscalated) {
		return null;
	}

	// Deterministic first — a proven fault does not need the classifier's
	// opinion, and costs no LLM round-trip to detect.
	const diagnosedFault = detectDiagnosedFault(opts.toolResults);
	// A narrated tool call means the promised check never ran: the customer was
	// told we were looking into it and nothing happened. Hand it to a human.
	const narratedToolCall =
		!opts.toolResults?.length && hasToolNarration(opts.responseText);

	const trigger = diagnosedFault
		? "confirmed fault in the diagnostic report"
		: narratedToolCall
			? "model narrated a tool call instead of making one"
			: (await detectMissedEscalation(
						opts.responseText,
						opts.toolResults,
					))
				? "model asserted an escalation it never made"
				: null;

	if (!trigger) {
		return null;
	}

	const escalateTool = opts.tools["escalate-telegram"];
	if (!escalateTool?.execute) {
		return null;
	}

	if (await hasRecentEscalation(opts.conversationId)) {
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
			`Escalation guard triggered — ${trigger}, no escalate-telegram call in this turn`,
			{
				conversationId: opts.conversationId,
				trigger,
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

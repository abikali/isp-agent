import { formatBeirutStamp } from "@repo/utils";

/**
 * The bot's briefing when a customer we messaged from the official (Salti)
 * number writes to the support bot instead: what we sent, what they
 * answered, and how to carry on.
 */

export interface OutreachContextInput {
	type: string;
	sentAt: Date | null;
	messageText: string | null;
	reply: string | null;
	outcome: string | null;
}

const GUIDANCE: Record<string, string> = {
	"post_stop:travel":
		"They are travelling / pausing: do not offer anything; say we will resume the line whenever they are back and ask them to message us then.",
	"post_stop:moved":
		"They moved house: ask where they moved to, offer to move the line or resume it, and escalate with the new area/address.",
	"post_stop:switched_provider":
		"They switched provider: ask why they left (price, speed, outages, support), offer to resume the line, and escalate with the details.",
	"post_stop:resume":
		"They want the line back: confirm the team will call them today and escalate if not already done. Never claim the line is already reactivated.",
	"post_install:bad":
		"They are unhappy after the installation: diagnose with the tools, then escalate with what you found.",
};

export function renderOutreachContext(input: OutreachContextInput): string {
	const when = input.sentAt
		? `on ${formatBeirutStamp(input.sentAt)} (Beirut)`
		: "recently";
	const what =
		input.type === "post_stop"
			? "after their subscription was stopped"
			: input.type === "post_install"
				? "a few days after their installation"
				: "";
	const lines = [
		`OFFICIAL-NUMBER OUTREACH (context): we messaged this customer from our official number ${when}${what ? `, ${what}` : ""}: «${(input.messageText ?? "").slice(0, 600)}». Their answer: ${input.reply ? `«${input.reply.slice(0, 600)}»` : "none yet"}.`,
	];
	const guidance = input.outcome
		? GUIDANCE[`${input.type}:${input.outcome}`]
		: undefined;
	if (guidance) {
		lines.push(guidance);
	} else if (input.type === "post_stop") {
		lines.push(
			"If they have not said why they stopped, ask gently; if they want the line back or moved, escalate with the details.",
		);
	}
	return lines.join("\n");
}

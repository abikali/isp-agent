import { beirutParts, beirutWallClockToUtc } from "@repo/utils";

/**
 * The instruction turn for a silence follow-up. Written as a bracketed
 * system marker in the user turn, the same convention as `[Context Notice]`,
 * so the model treats it as the operator speaking, not the customer.
 */
export const NO_FOLLOW_UP = "NO_FOLLOW_UP";

export function buildFollowUpInstruction(
	minutes: number,
	guidance: string | null | undefined,
	attempt = 1,
	maxAttempts = 1,
): string {
	const extra = guidance?.trim()
		? `\nAdmin guidance for follow-ups (follow it): "${guidance.trim()}"`
		: "";
	// Later nudges: the customer already ignored one. Shorter, and the last
	// one closes the loop instead of asking again.
	const repeat =
		attempt > 1
			? ` This is follow-up ${attempt} of ${maxAttempts}; the earlier one got no answer, so keep it to one short line and do not repeat its wording.` +
				(attempt >= maxAttempts
					? " It is the LAST one: do not ask again, just say they can message any time when they are ready."
					: "")
			: "";
	return (
		`[Follow-up check: the customer has been silent for ${minutes} minutes since your last message.${repeat} ` +
		"Write ONE short follow-up in the customer's language that re-asks the pending question or checks whether the issue is resolved. " +
		"If you were waiting for something specific from them (a location pin, a phone number, a username, a yes/no answer), ask for exactly that and nothing else. " +
		"No new troubleshooting steps, no promises, no greeting, no apology. " +
		`If the exchange was clearly finished (they thanked you or said bye, the issue was resolved, they said they would get back later, they asked not to be messaged, or your last message was itself a closing line), reply with exactly ${NO_FOLLOW_UP} and nothing else. ` +
		`Also reply ${NO_FOLLOW_UP} when your last message said the team was notified or will contact them and you are not waiting for anything from the customer.]` +
		extra
	);
}

/**
 * The instruction turn for the check-back after an escalation (#13): a
 * separate, later question than the silence nudge — "did the team reach you,
 * is it solved?" — which the silence nudge deliberately never asks.
 */
export function buildPostEscalationInstruction(
	hours: number,
	taskTitle: string,
	teamRepliedInChat: boolean,
): string {
	const title = taskTitle.replace(/^AI Escalation:\s*/, "").slice(0, 200);
	return (
		`[Check-back: ${hours} hours ago you forwarded this customer's issue to the team ("${title}"). ` +
		(teamRepliedInChat
			? "A teammate has written in this chat since. "
			: "Nothing has been written in this chat since. ") +
		"Write ONE short message in the customer's language asking whether the team reached them and whether the problem is solved now. " +
		"No troubleshooting, no promises, no greeting, no apology. " +
		`Reply ${NO_FOLLOW_UP} only if the chat already shows the problem is solved or the customer asked not to be messaged.]`
	);
}

/**
 * The model declined. Models wrap the token ("NO_FOLLOW_UP.", "`NO_FOLLOW_UP`",
 * "*NO_FOLLOW_UP*") or add a sentence around it; any of those must stay
 * silent instead of reaching the customer.
 */
export function isNoFollowUpReply(text: string): boolean {
	return /NO[\s_-]*FOLLOW[\s_-]*UP/i.test(text);
}

/** Beirut wall-clock window a follow-up may be sent in ("HH:MM"). */
export interface FollowUpWindow {
	start: string;
	end: string;
}

export const DEFAULT_FOLLOW_UP_WINDOW: FollowUpWindow = {
	start: "09:00",
	end: "20:30",
};

/**
 * How late a moved FIRST nudge may land after the bot's reply: the closed
 * overnight span plus 90 minutes — 14 hours for the default 09:00–20:30.
 */
function maxFirstNudgeDelayMs(startMin: number, endMin: number): number {
	return (24 * 60 - (endMin - startMin) + 90) * 60_000;
}

function toMinutes(hhmm: string): number {
	const [h = "0", m = "0"] = hhmm.split(":");
	return Number(h) * 60 + Number(m);
}

/** Is `at` inside the Beirut follow-up window? */
export function isWithinFollowUpHours(
	at: Date,
	window: FollowUpWindow = DEFAULT_FOLLOW_UP_WINDOW,
): boolean {
	const { hour, minute } = beirutParts(at);
	const minutes = hour * 60 + minute;
	return (
		minutes >= toMinutes(window.start) && minutes < toMinutes(window.end)
	);
}

/**
 * When a nudge due `delayMinutes` after `from` should fire, or null when it
 * should not be sent at all. Around 30% of silent bot replies come after
 * 20:00 Beirut, and a nudge at 23:00 is worse than none: a nudge due outside
 * the window moves to 30 minutes after it opens (the opening itself for a
 * window shorter than an hour). A FIRST nudge (`attempt` 1) is dropped when
 * that lands more than 14 hours after the reply (default window; scales with
 * the closed span); later ones are long gaps by design and only move.
 */
export function resolveFollowUpFireAt(
	from: Date,
	delayMinutes: number,
	window: FollowUpWindow = DEFAULT_FOLLOW_UP_WINDOW,
	attempt = 1,
): Date | null {
	const due = new Date(from.getTime() + delayMinutes * 60_000);
	if (isWithinFollowUpHours(due, window)) {
		return due;
	}
	const startMin = toMinutes(window.start);
	const endMin = toMinutes(window.end);
	const shiftedMin = endMin - startMin > 60 ? startMin + 30 : startMin;
	const p = beirutParts(due);
	const dayOffset = p.hour * 60 + p.minute < startMin ? 0 : 1;
	const day = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
	const pad = (n: number) => String(n).padStart(2, "0");
	const fireAt = beirutWallClockToUtc(
		`${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${pad(Math.floor(shiftedMin / 60))}:${pad(shiftedMin % 60)}`,
	);
	if (
		attempt === 1 &&
		fireAt.getTime() - from.getTime() >
			maxFirstNudgeDelayMs(startMin, endMin)
	) {
		return null;
	}
	return fireAt;
}

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
): string {
	const extra = guidance?.trim()
		? `\nAdmin guidance for follow-ups (follow it): "${guidance.trim()}"`
		: "";
	return (
		`[Follow-up check: the customer has been silent for ${minutes} minutes since your last message. ` +
		"Write ONE short follow-up in the customer's language that re-asks the pending question or checks whether the issue is resolved. " +
		"If you were waiting for something specific from them (a location pin, a phone number, a username, a yes/no answer), ask for exactly that and nothing else. " +
		"No new troubleshooting steps, no promises, no greeting, no apology. " +
		`If the exchange was clearly finished (they thanked you or said bye, the issue was resolved, they said they would get back later, or your last message was itself a closing line), reply with exactly ${NO_FOLLOW_UP} and nothing else. ` +
		`Also reply ${NO_FOLLOW_UP} when your last message said the team was notified or will contact them and you are not waiting for anything from the customer.]` +
		extra
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

/** Beirut wall-clock window in which a follow-up may be sent. */
const WINDOW_START_MIN = 9 * 60;
const WINDOW_END_MIN = 20 * 60 + 30;
/** A nudge due outside the window moves to this time. */
const SHIFTED_TIME = "09:30";
/** Never send a shifted nudge more than this long after the bot's reply. */
const MAX_SHIFTED_DELAY_MS = 14 * 60 * 60_000;

/** Is `at` inside the 09:00–20:30 Beirut follow-up window? */
export function isWithinFollowUpHours(at: Date): boolean {
	const { hour, minute } = beirutParts(at);
	const minutes = hour * 60 + minute;
	return minutes >= WINDOW_START_MIN && minutes < WINDOW_END_MIN;
}

/**
 * When the follow-up for a reply sent at `repliedAt` should fire, or null
 * when it should not be sent at all. Around 30% of silent bot replies come
 * after 20:00 Beirut, and a nudge at 23:00 is worse than none: a nudge due
 * outside 09:00–20:30 moves to 09:30 the next morning, and is dropped when
 * that lands more than 14 hours after the reply.
 */
export function resolveFollowUpFireAt(
	repliedAt: Date,
	delayMinutes: number,
): Date | null {
	const due = new Date(repliedAt.getTime() + delayMinutes * 60_000);
	if (isWithinFollowUpHours(due)) {
		return due;
	}
	const p = beirutParts(due);
	const dayOffset = p.hour * 60 + p.minute < WINDOW_START_MIN ? 0 : 1;
	const day = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
	const pad = (n: number) => String(n).padStart(2, "0");
	const fireAt = beirutWallClockToUtc(
		`${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${SHIFTED_TIME}`,
	);
	if (fireAt.getTime() - repliedAt.getTime() > MAX_SHIFTED_DELAY_MS) {
		return null;
	}
	return fireAt;
}

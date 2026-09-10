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
		"No new troubleshooting steps, no promises, no greeting, no apology. " +
		`If the exchange was clearly finished (they thanked you or said bye, the issue was resolved, they said they would get back later, or your last message was itself a closing line), reply with exactly ${NO_FOLLOW_UP} and nothing else.]` +
		extra
	);
}

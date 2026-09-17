/**
 * Manual bulk close for AI escalation tasks.
 *
 * The AI files an OPEN task per escalation and nothing ever closes it — the
 * team handles the customer on WhatsApp and moves on — so the Escalations
 * page piles up hundreds of stale OPEN rows. Closing is a deliberate admin
 * action (no background job), and every closed task gets a note saying who
 * closed it, when and how, since the task itself carries no other trace.
 */

const beirutFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Beirut",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

export interface EscalationCloseNoteInput {
	closedByName: string;
	closedAt: Date;
	/** Set when closed through "Close all older than N days". */
	olderThanDays?: number | undefined;
}

export function buildEscalationCloseNote({
	closedByName,
	closedAt,
	olderThanDays,
}: EscalationCloseNoteInput): string {
	const at = beirutFormatter.format(closedAt).replace(", ", " ");
	const how =
		olderThanDays !== undefined
			? `in bulk (open escalations older than ${olderThanDays} day${olderThanDays === 1 ? "" : "s"})`
			: "from the Escalations page";
	return `[${at} Beirut] Closed ${how} by ${closedByName}.`;
}

/** Appends the close note below any existing notes. */
export function appendTaskNote(existing: string | null, note: string): string {
	const trimmed = existing?.trim();
	return trimmed ? `${trimmed}\n\n${note}` : note;
}

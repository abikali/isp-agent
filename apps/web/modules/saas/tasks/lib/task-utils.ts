import { dueDeadline } from "@repo/utils";
import { beirutWallClockToUtc, formatDate } from "@shared/lib/format";

/**
 * Past due: a timed task from its instant, a date-only one once its Beirut
 * day is over (a task due "today" isn't late at 03:00).
 */
export function isOverdue(
	dueDate: string | Date | null,
	status: string,
	dueHasTime = false,
): boolean {
	// PENDING_APPROVAL: field work is done, only the review is outstanding
	if (
		!dueDate ||
		status === "PENDING_APPROVAL" ||
		status === "COMPLETED" ||
		status === "CANCELLED"
	) {
		return false;
	}
	return dueDeadline(dueDate, dueHasTime) < new Date();
}

/**
 * Form values → API due fields. A time makes it an exact Beirut instant; a
 * date alone is a whole Beirut day, stored at Beirut noon so no timezone
 * shift can move it to a neighbouring day.
 */
export function toDuePayload(
	date: string,
	time: string,
): { dueDate: Date | null; dueHasTime: boolean } {
	if (!date) {
		return { dueDate: null, dueHasTime: false };
	}
	return time
		? { dueDate: beirutWallClockToUtc(`${date}T${time}`), dueHasTime: true }
		: { dueDate: beirutWallClockToUtc(`${date}T12:00`), dueHasTime: false };
}

/**
 * A task whose completion was rejected by an approver. Derived rather than
 * stored: completeWithEvidence always stamps `completedByEmployee`, and
 * reviewCompletion's reject clears `completedAt` and reopens the task while
 * leaving the evidence behind. An OPEN task that carries a completer but no
 * completion timestamp is therefore exactly one that bounced back.
 */
export function isReturned(task: {
	status: string;
	completedAt: string | Date | null;
	completedByEmployee?: { id: string; name: string } | null;
}): boolean {
	return (
		task.status === "OPEN" &&
		!task.completedAt &&
		Boolean(task.completedByEmployee)
	);
}

export function timeAgo(date: string | Date): string {
	const d = new Date(date);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 60) {
		return `${diffMins}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	if (diffDays < 7) {
		return `${diffDays}d ago`;
	}
	return formatDate(d);
}

import { formatDate } from "@shared/lib/format";

export function isOverdue(
	dueDate: string | Date | null,
	status: string,
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
	return new Date(dueDate) < new Date();
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

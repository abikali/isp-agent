export function isOverdue(
	dueDate: string | Date | null,
	status: string,
): boolean {
	if (!dueDate || status === "COMPLETED" || status === "CANCELLED") {
		return false;
	}
	return new Date(dueDate) < new Date();
}

export function formatDate(date: string | Date): string {
	return new Date(date).toLocaleDateString("en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function formatDateTime(date: string | Date): string {
	return new Date(date).toLocaleString("en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
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
	return d.toLocaleDateString("en-GB");
}

/**
 * Threshold for considering a location request "recent" enough to warn
 * the admin before sending another one (to avoid spamming the customer).
 */
export const RECENT_REQUEST_MS = 24 * 60 * 60 * 1000;

export function isLocationRequestRecent(
	locationRequestedAt: Date | string | null | undefined,
): boolean {
	if (!locationRequestedAt) {
		return false;
	}
	const date =
		typeof locationRequestedAt === "string"
			? new Date(locationRequestedAt)
			: locationRequestedAt;
	return Date.now() - date.getTime() < RECENT_REQUEST_MS;
}

/**
 * Human-friendly "X ago" formatter used in dialogs and section headers.
 * Note: there's also a terser `timeAgo` in `modules/saas/tasks/lib` that
 * returns forms like "3h ago" — we use the longer form here because these
 * strings appear in full sentences.
 */
export function formatLocationRequestAge(
	locationRequestedAt: Date | string | null | undefined,
): string | null {
	if (!locationRequestedAt) {
		return null;
	}
	const date =
		typeof locationRequestedAt === "string"
			? new Date(locationRequestedAt)
			: locationRequestedAt;
	const ms = Date.now() - date.getTime();
	if (ms < 0) {
		return "just now";
	}
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) {
		return "just now";
	}
	if (minutes < 60) {
		return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	}
	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days} day${days === 1 ? "" : "s"} ago`;
	}
	const months = Math.floor(days / 30);
	return `${months} month${months === 1 ? "" : "s"} ago`;
}

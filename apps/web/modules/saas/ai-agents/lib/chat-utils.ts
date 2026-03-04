/**
 * Utility functions for WhatsApp-style chat UI formatting.
 */

const ONE_DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

/** Format a date as "HH:MM" (24h). */
export function formatMessageTime(date: Date | string): string {
	const d = new Date(date);
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

/** Format a date for chat date separators: "TODAY", "YESTERDAY", or "Mon, Dec 25". */
export function formatChatDate(date: Date | string): string {
	const d = startOfDay(new Date(date));
	const now = startOfDay(new Date());
	const diffMs = now.getTime() - d.getTime();

	if (diffMs < ONE_DAY_MS) {
		return "TODAY";
	}
	if (diffMs < 2 * ONE_DAY_MS) {
		return "YESTERDAY";
	}

	return d
		.toLocaleDateString([], {
			weekday: "short",
			month: "short",
			day: "numeric",
		})
		.toUpperCase();
}

/** Format a timestamp for the conversation list: "Today", "Yesterday", "Mon", or short date. */
export function formatListTimestamp(date: Date | string): string {
	const d = startOfDay(new Date(date));
	const now = startOfDay(new Date());
	const diffMs = now.getTime() - d.getTime();

	if (diffMs < ONE_DAY_MS) {
		return formatMessageTime(date);
	}
	if (diffMs < 2 * ONE_DAY_MS) {
		return "Yesterday";
	}
	if (diffMs < 7 * ONE_DAY_MS) {
		return new Date(date).toLocaleDateString([], { weekday: "short" });
	}

	return new Date(date).toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});
}

interface MessageItem {
	id: string;
	createdAt: Date | string;
	[key: string]: unknown;
}

export interface MessageGroup<T extends MessageItem> {
	date: string;
	messages: T[];
}

/** Group messages by date for rendering date separator pills. */
export function groupMessagesByDate<T extends MessageItem>(
	messages: T[],
): MessageGroup<T>[] {
	const groups: MessageGroup<T>[] = [];
	let currentDate = "";

	for (const msg of messages) {
		const date = formatChatDate(msg.createdAt);
		if (date !== currentDate) {
			currentDate = date;
			groups.push({ date, messages: [] });
		}
		const lastGroup = groups[groups.length - 1];
		if (lastGroup) {
			lastGroup.messages.push(msg);
		}
	}

	return groups;
}

/** Extract initials from a contact name. */
export function getContactInitials(name: string | null | undefined): string {
	if (!name) {
		return "?";
	}
	const parts = name.trim().split(/\s+/);
	const first = parts[0] ?? "";
	const last = parts[parts.length - 1] ?? "";
	if (parts.length === 1) {
		return first.charAt(0).toUpperCase();
	}
	return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Get a deterministic color class for an avatar based on the name. */
export function getAvatarColor(name: string | null | undefined): string {
	const colors = [
		"bg-blue-500",
		"bg-emerald-500",
		"bg-violet-500",
		"bg-rose-500",
		"bg-amber-500",
		"bg-cyan-500",
		"bg-pink-500",
		"bg-indigo-500",
	] as const;
	if (!name) {
		return colors[0];
	}
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return colors[Math.abs(hash) % colors.length] ?? colors[0];
}

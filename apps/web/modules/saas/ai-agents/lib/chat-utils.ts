/**
 * Utility functions for WhatsApp-style chat UI formatting.
 * All times/dates are anchored to Asia/Beirut so viewers in other timezones
 * see the same day boundaries.
 */

import { formatDate, formatTime, getBeirutDate } from "@shared/lib/format";

const ONE_DAY_MS = 86_400_000;

function beirutDayIndex(date: Date | string): number {
	const { year, month, day } = getBeirutDate(date);
	return Date.UTC(year, month - 1, day) / ONE_DAY_MS;
}

/** Format a date as "HH:MM" (24h) in Beirut time. */
export function formatMessageTime(date: Date | string): string {
	return formatTime(date, {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
}

/** Format a date for chat date separators: "TODAY", "YESTERDAY", or "Mon, Dec 25". */
export function formatChatDate(date: Date | string): string {
	const diffDays = beirutDayIndex(new Date()) - beirutDayIndex(date);

	if (diffDays <= 0) {
		return "TODAY";
	}
	if (diffDays === 1) {
		return "YESTERDAY";
	}

	return formatDate(date, {
		weekday: "short",
		month: "short",
		day: "numeric",
	}).toUpperCase();
}

/** Format a timestamp for the conversation list: "Today", "Yesterday", "Mon", or short date. */
export function formatListTimestamp(date: Date | string): string {
	const diffDays = beirutDayIndex(new Date()) - beirutDayIndex(date);

	if (diffDays <= 0) {
		return formatMessageTime(date);
	}
	if (diffDays === 1) {
		return "Yesterday";
	}
	if (diffDays < 7) {
		return formatDate(date, { weekday: "short" });
	}

	return formatDate(date, {
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

/** Format a phone number string as international format with + prefix. */
export function formatPhoneNumber(
	phone: string | null | undefined,
): string | null {
	if (!phone) {
		return null;
	}
	// Already has + prefix
	if (phone.startsWith("+")) {
		return phone;
	}
	// Raw digits — add + prefix
	if (/^\d+$/.test(phone)) {
		return `+${phone}`;
	}
	return phone;
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

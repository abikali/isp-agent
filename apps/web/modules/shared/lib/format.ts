import {
	BEIRUT_TIMEZONE,
	beirutParts,
	beirutWallClockToUtc,
} from "@repo/utils";

export { BEIRUT_TIMEZONE, beirutWallClockToUtc };

/** Preset for medium-length dates: e.g. "25 Apr 2026". */
export const MEDIUM_DATE_FORMAT = {
	year: "numeric",
	month: "short",
	day: "numeric",
} as const satisfies Intl.DateTimeFormatOptions;

/** Preset for medium-length date + time: e.g. "25 Apr 2026, 14:30". */
export const MEDIUM_DATE_TIME_FORMAT = {
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
} as const satisfies Intl.DateTimeFormatOptions;

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
	return value instanceof Date ? value : new Date(value);
}

export function formatDate(
	value: DateInput,
	options: Intl.DateTimeFormatOptions = {},
): string {
	return toDate(value).toLocaleDateString("en-GB", {
		timeZone: BEIRUT_TIMEZONE,
		...options,
	});
}

export function formatDateTime(
	value: DateInput,
	options: Intl.DateTimeFormatOptions = {},
): string {
	return toDate(value).toLocaleString("en-GB", {
		timeZone: BEIRUT_TIMEZONE,
		...options,
	});
}

export function formatTime(
	value: DateInput,
	options: Intl.DateTimeFormatOptions = {},
): string {
	return toDate(value).toLocaleTimeString("en-GB", {
		timeZone: BEIRUT_TIMEZONE,
		...options,
	});
}

const BEIRUT_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
	timeZone: BEIRUT_TIMEZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** Current year/month/day as seen in Asia/Beirut. */
export function getBeirutDate(value: DateInput = new Date()): {
	year: number;
	month: number;
	day: number;
} {
	let year = 0;
	let month = 0;
	let day = 0;
	for (const p of BEIRUT_DATE_PARTS.formatToParts(toDate(value))) {
		if (p.type === "year") {
			year = Number(p.value);
		} else if (p.type === "month") {
			month = Number(p.value);
		} else if (p.type === "day") {
			day = Number(p.value);
		}
	}
	return { year, month, day };
}

/** Format a date as YYYY-MM-DD in Beirut time (for `<input type="date">` or filenames). */
export function formatDateInput(value: DateInput = new Date()): string {
	const { year, month, day } = getBeirutDate(value);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Format a UTC instant as `YYYY-MM-DDTHH:mm` Beirut wall-clock — the value
 * shape `<input type="datetime-local">` expects. Inverse of
 * {@link beirutWallClockToUtc}.
 */
export function formatDateTimeLocalInput(
	value: DateInput = new Date(),
): string {
	const { year, month, day, hour, minute } = beirutParts(value);
	const p2 = (n: number) => String(n).padStart(2, "0");
	return `${year}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(minute)}`;
}

/**
 * A task's due value in Beirut: "30 Sep 2026" for a whole-day due date,
 * "30 Sep 2026, 14:30" when it carries a time.
 */
export function formatDue(task: {
	dueDate: DateInput | null;
	dueHasTime?: boolean | null;
}): string {
	if (!task.dueDate) {
		return "";
	}
	return task.dueHasTime
		? formatDateTime(task.dueDate, MEDIUM_DATE_TIME_FORMAT)
		: formatDate(task.dueDate, MEDIUM_DATE_FORMAT);
}

/** Beirut `HH:mm` of an instant — the value `<input type="time">` expects. */
export function formatTimeInput(value: DateInput): string {
	const { hour, minute } = beirutParts(value);
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | bigint): string {
	let value = typeof bytes === "bigint" ? Number(bytes) : bytes;
	if (value === 0) {
		return "0 B";
	}
	let unitIndex = 0;
	while (Math.abs(value) >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	const unit = BYTE_UNITS[unitIndex] ?? "B";
	return `${value.toFixed(value < 10 && unitIndex > 0 ? 2 : value < 100 && unitIndex > 0 ? 1 : 0)} ${unit}`;
}

export function formatCurrency(value: number, currency = "$"): string {
	return `${currency}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | bigint): string {
	const num = typeof value === "bigint" ? Number(value) : value;
	return num.toLocaleString();
}

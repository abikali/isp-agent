export const BEIRUT_TIMEZONE = "Asia/Beirut";

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

type DateInput = Date | string | number;

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

export function truncate(str: string, max: number): string {
	return str.length > max ? `${str.slice(0, max)}...` : str;
}

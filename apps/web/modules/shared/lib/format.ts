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

const BEIRUT_DATE_TIME_PARTS = new Intl.DateTimeFormat("en-CA", {
	timeZone: BEIRUT_TIMEZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

function beirutParts(value: DateInput): {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
} {
	let year = 0;
	let month = 1;
	let day = 1;
	let hour = 0;
	let minute = 0;
	for (const p of BEIRUT_DATE_TIME_PARTS.formatToParts(toDate(value))) {
		if (p.type === "year") {
			year = Number(p.value);
		} else if (p.type === "month") {
			month = Number(p.value);
		} else if (p.type === "day") {
			day = Number(p.value);
		} else if (p.type === "hour") {
			// Intl can render midnight as "24"; normalize to 0.
			hour = p.value === "24" ? 0 : Number(p.value);
		} else if (p.type === "minute") {
			minute = Number(p.value);
		}
	}
	return { year, month, day, hour, minute };
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

/** Beirut's UTC offset (ms east of UTC) at a given instant — handles DST. */
function beirutOffsetMs(instant: Date): number {
	const { year, month, day, hour, minute } = beirutParts(instant);
	const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
	// Compare at minute granularity (Beirut offsets are whole minutes).
	const instantMinutes = Math.floor(instant.getTime() / 60000) * 60000;
	return wallClockAsUtc - instantMinutes;
}

/**
 * Interpret a `YYYY-MM-DDTHH:mm` string as Asia/Beirut wall-clock time and
 * return the corresponding UTC instant. DST-safe: the offset is resolved at
 * the target instant (with a one-pass refinement across DST transitions).
 * Inverse of {@link formatDateTimeLocalInput}. Returns an invalid Date for
 * unparseable input.
 */
export function beirutWallClockToUtc(local: string): Date {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
	if (!m) {
		return new Date(Number.NaN);
	}
	const wallClockAsUtcMs = Date.UTC(
		Number(m[1]),
		Number(m[2]) - 1,
		Number(m[3]),
		Number(m[4]),
		Number(m[5]),
	);
	const offset = beirutOffsetMs(new Date(wallClockAsUtcMs));
	let utcMs = wallClockAsUtcMs - offset;
	// Re-resolve once: near a DST boundary the offset at the corrected instant
	// can differ from the first guess.
	const refined = beirutOffsetMs(new Date(utcMs));
	if (refined !== offset) {
		utcMs = wallClockAsUtcMs - refined;
	}
	return new Date(utcMs);
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

/**
 * Asia/Beirut wall-clock helpers, DST-safe. Shared by the web app (date
 * inputs) and the AI package (working hours), so the two never disagree on
 * what "09:00 in Beirut" is.
 */
export const BEIRUT_TIMEZONE = "Asia/Beirut";

export type BeirutDateInput = Date | string | number;

function toDate(value: BeirutDateInput): Date {
	return value instanceof Date ? value : new Date(value);
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

export interface BeirutParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

export function beirutParts(value: BeirutDateInput): BeirutParts {
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

/** 0 = Sunday … 6 = Saturday, for the Beirut calendar day of `value`. */
export function beirutWeekday(value: BeirutDateInput): number {
	const { year, month, day } = beirutParts(value);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Beirut's UTC offset (ms east of UTC) at a given instant — handles DST. */
export function beirutOffsetMs(instant: Date): number {
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
 * Returns an invalid Date for unparseable input.
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

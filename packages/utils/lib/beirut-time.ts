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

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** UTC instant of 00:00 Beirut on the Beirut calendar day of `value`. */
export function beirutDayStartUtc(value: BeirutDateInput): Date {
	const { year, month, day } = beirutParts(value);
	return beirutWallClockToUtc(`${year}-${pad2(month)}-${pad2(day)}T00:00`);
}

/** UTC instant of 23:59:59.999 Beirut on the Beirut calendar day of `value`. */
export function beirutDayEndUtc(value: BeirutDateInput): Date {
	const { year, month, day } = beirutParts(value);
	const lastMinute = beirutWallClockToUtc(
		`${year}-${pad2(month)}-${pad2(day)}T23:59`,
	);
	return new Date(lastMinute.getTime() + 59_999);
}

/**
 * A task due value for the server side and Telegram: numeric `30/09/2026`
 * (whole day) or `30/09/2026 14:30` (Beirut wall-clock). Numeric on purpose —
 * it reads the same inside an Arabic `bilingual()` line.
 */
export function formatBeirutDue(
	dueDate: BeirutDateInput,
	hasTime: boolean,
): string {
	const { year, month, day, hour, minute } = beirutParts(dueDate);
	const date = `${pad2(day)}/${pad2(month)}/${year}`;
	return hasTime ? `${date} ${pad2(hour)}:${pad2(minute)}` : date;
}

/**
 * When a due value stops being on time: the instant itself when it carries a
 * time, otherwise the end of its Beirut day.
 */
export function dueDeadline(dueDate: BeirutDateInput, hasTime: boolean): Date {
	return hasTime ? toDate(dueDate) : beirutDayEndUtc(dueDate);
}

/**
 * `hhmm` Beirut wall-clock on the Beirut calendar day `daysAhead` after the
 * day of `from` — "3 days after the install, at 11:00". DST-safe.
 */
export function beirutDayAt(
	from: BeirutDateInput,
	daysAhead: number,
	hhmm: string,
): Date {
	const { year, month, day } = beirutParts(from);
	const target = new Date(Date.UTC(year, month - 1, day + daysAhead));
	const [h = "0", m = "0"] = hhmm.split(":");
	return beirutWallClockToUtc(
		`${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(target.getUTCDate())}T${pad2(Number(h))}:${pad2(Number(m))}`,
	);
}

/** "2026-09-30 14:05" in Beirut time, for notes and messages. */
export function formatBeirutStamp(value: BeirutDateInput): string {
	const { year, month, day, hour, minute } = beirutParts(value);
	return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}`;
}

/** `YYYY-MM-DD` of the Beirut calendar day an instant falls on. */
export function beirutDateString(value: BeirutDateInput): string {
	const { year, month, day } = beirutParts(value);
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * End of a Beirut calendar day (`YYYY-MM-DD`), the time iRadius billing
 * expiries use: `literal` is the tz-naive MySQL DATETIME iRadius stores
 * (`2026-10-01 23:59:00`), `utc` the same instant for Postgres
 * (`2026-10-01T20:59:00Z` in summer, `21:59Z` in winter).
 */
export function beirutEndOfDay(dateStr: string): {
	literal: string;
	utc: Date;
} {
	return {
		literal: `${dateStr} 23:59:00`,
		utc: beirutWallClockToUtc(`${dateStr}T23:59`),
	};
}

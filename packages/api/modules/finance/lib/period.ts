/**
 * Period resolution for finance reporting.
 *
 * Deliberately calendar-based rather than billing-month based. A billing month
 * is an operational construct — it opens, locks, and can lag the calendar. An
 * owner asking "how did August go?" means the calendar month, and every cost in
 * the business (rent, upstream, wages) lands on calendar dates.
 *
 * Retail revenue is the one figure read through the billing month, because a
 * `Payment` belongs to the cycle it settles, not the day it was handed over.
 */

export type PeriodKey = "this-month" | "last-month" | "last-3" | "last-12";

export interface Period {
	/** Inclusive start. */
	from: Date;
	/** Exclusive end — always use `lt`, never `lte`, so a payment at 23:59:59.7
	 *  on the last day cannot fall outside the month it belongs to. */
	to: Date;
	label: string;
	/** Calendar months the period spans, oldest first. */
	months: Array<{ year: number; month: number }>;
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function monthStart(year: number, month: number): Date {
	return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function addMonths(year: number, month: number, delta: number) {
	const zero = year * 12 + (month - 1) + delta;
	return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

function monthRange(
	endYear: number,
	endMonth: number,
	count: number,
): Array<{ year: number; month: number }> {
	const months: Array<{ year: number; month: number }> = [];
	for (let i = count - 1; i >= 0; i--) {
		months.push(addMonths(endYear, endMonth, -i));
	}
	return months;
}

/** Resolve a named period against a reference date (defaults to now). */
export function resolvePeriod(key: PeriodKey, now = new Date()): Period {
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth() + 1;

	if (key === "last-month") {
		const prev = addMonths(y, m, -1);
		return {
			from: monthStart(prev.year, prev.month),
			to: monthStart(y, m),
			label: `${MONTH_NAMES[prev.month - 1]} ${prev.year}`,
			months: [prev],
		};
	}

	if (key === "last-3" || key === "last-12") {
		const count = key === "last-3" ? 3 : 12;
		const months = monthRange(y, m, count);
		const first = months[0];
		const next = addMonths(y, m, 1);
		return {
			from: monthStart(first?.year ?? y, first?.month ?? m),
			to: monthStart(next.year, next.month),
			label: `Last ${count} months`,
			months,
		};
	}

	const next = addMonths(y, m, 1);
	return {
		from: monthStart(y, m),
		to: monthStart(next.year, next.month),
		label: `${MONTH_NAMES[m - 1]} ${y}`,
		months: [{ year: y, month: m }],
	};
}

/**
 * The period immediately before this one, of the same length.
 *
 * Every number an owner reads is meaningless without "compared to what?".
 * A $22k profit is excellent or alarming depending entirely on last month.
 */
export function previousPeriod(period: Period): Period {
	const count = period.months.length;
	const first = period.months[0];
	if (!first) {
		return period;
	}
	const end = addMonths(first.year, first.month, -1);
	const months = monthRange(end.year, end.month, count);
	const start = months[0] ?? end;
	return {
		from: monthStart(start.year, start.month),
		to: monthStart(first.year, first.month),
		label:
			count === 1
				? `${MONTH_NAMES[end.month - 1]} ${end.year}`
				: `Previous ${count} months`,
		months,
	};
}

/**
 * How far through the period we are, 0–1.
 *
 * The single most dangerous comparison in a monthly report is a partial month
 * against a whole one — on the 3rd of the month, revenue looks catastrophic.
 * Every comparison this module emits carries this fraction so the UI can say
 * "9 days in" instead of implying a collapse.
 */
export function periodProgress(period: Period, now = new Date()): number {
	const span = period.to.getTime() - period.from.getTime();
	if (span <= 0) {
		return 1;
	}
	const elapsed = now.getTime() - period.from.getTime();
	return Math.min(1, Math.max(0, elapsed / span));
}

export function monthLabel(year: number, month: number): string {
	return `${MONTH_NAMES[month - 1] ?? ""} ${year}`;
}

export function shortMonthLabel(year: number, month: number): string {
	return `${(MONTH_NAMES[month - 1] ?? "").slice(0, 3)} ${String(year).slice(2)}`;
}

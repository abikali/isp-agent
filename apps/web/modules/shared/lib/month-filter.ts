import { formatDate } from "./format";

/** Month-picker value: `"YYYY-M"` for a month, or `"all"`. */
export type MonthFilter = string;

export function currentMonthFilter(): MonthFilter {
	const now = new Date();
	return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

/**
 * Inclusive `from`/`to` bounds for a month filter. `to` is the last instant of
 * the month because the expense readers compare with `lte` — an exclusive
 * next-month boundary would sweep in the 1st at midnight.
 */
export function monthRange(monthFilter: MonthFilter): {
	from?: Date;
	to?: Date;
} {
	if (monthFilter === "all") {
		return {};
	}
	const [year, month] = monthFilter.split("-").map(Number);
	if (year === undefined || month === undefined) {
		return {};
	}
	return {
		from: new Date(year, month - 1, 1),
		to: new Date(year, month, 0, 23, 59, 59, 999),
	};
}

/** The last 24 months, newest first. */
export function buildMonthOptions(
	options: { currentLabel?: string } = {},
): Array<{ value: MonthFilter; label: string }> {
	const now = new Date();
	return Array.from({ length: 24 }, (_, i) => {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		return {
			value: `${d.getFullYear()}-${d.getMonth() + 1}`,
			label:
				i === 0 && options.currentLabel
					? options.currentLabel
					: formatDate(d, { month: "long", year: "numeric" }),
		};
	});
}

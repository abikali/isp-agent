/**
 * Current calendar month in UTC (the server timezone) — the worker's intuitive
 * reading of "this month" regardless of the billing-month lock state.
 *
 * Shared by every worker-portal "this month" reader (`myStats`, `myTrend`,
 * `myMonthCustomers`) so the stat strip, the trend chart and the customer list
 * can never disagree about which rows fall inside the month.
 */
export function currentMonthRange(): { gte: Date; lt: Date } {
	const now = new Date();
	return {
		gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
		lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
	};
}

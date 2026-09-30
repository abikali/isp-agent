/**
 * Prisma filter fragments for billing queries.
 *
 * Prisma's `NOT: { field: { equals: X } }` silently excludes rows
 * where the field is NULL. These helpers encode the correct OR pattern.
 */

export {
	BILLABLE_CUSTOMER_STATUSES,
	excludeGroupFilter,
	PENDING_STOPPED_PAYMENT,
} from "@repo/database/billing-filters";

/** Exclude stopped payment records from billing aggregations. */
export const EXCLUDE_STOPPED = { stoppedAccount: false } as const;

/**
 * Cash-ledger rows that actually move a worker/collector balance. The
 * `SALARY` type (money handed TO a worker, funded by the company) is
 * display-only and must be excluded from every balance + handed-off sum, so
 * giving a worker money never changes his cash in hand. `type` is a
 * non-nullable enum, so `not` is safe here (no NULL-exclusion footgun).
 */
export const LEDGER_CASH = { type: { not: "SALARY" } } as const;

/**
 * A payment row with real money or a free waiver on it. Stopped payments are
 * excluded; they go through the separate review/approval flow.
 *
 * ⚠️ This is NOT "the month is paid off". Row existence used to mean exactly
 * that, which let a $10 partial close a $50 invoice — the 2026-09-01 partial-
 * payment bug. "Is the month settled?" is an amount comparison and lives in
 * lib/settlement.ts (`monthSettled` / `monthRemaining`, keyed on customer +
 * billing month).
 *
 * Keep using this fragment only where existence is the actual question:
 *   - protection guards ("this invoice has cash recorded — refuse to
 *     void/delete it", void-invoice.ts / delete-invoice.ts), and
 *   - cash sums / cash-activity stats (worker-balance, list-workers), where
 *     it filters which rows count as collected money.
 */
export const SETTLED_PAYMENT = {
	stoppedAccount: false,
	OR: [{ paidAmount: { gt: 0 } }, { freeAccount: true }],
};

/**
 * A stopped payment that admin has approved — the customer is now INACTIVE.
 */
export const APPROVED_STOPPED_PAYMENT = {
	stoppedAccount: true,
	reviewedAt: { not: null },
} as const;

/**
 * Invoice filter: exclude voided invoices. A voided invoice exists in
 * history (for audit) but does not count toward "customer owes" or
 * "customer due" in any billing view.
 */
export const NOT_VOIDED = { voidedAt: null } as const;

/**
 * Build a Prisma date range filter from optional dateFrom/dateTo strings.
 * Always extends dateTo to end-of-day (23:59:59.999) for inclusive filtering.
 * Returns undefined if neither bound is provided.
 */
export function buildDateRangeFilter(
	dateFrom?: string | null,
	dateTo?: string | null,
): { gte?: Date; lte?: Date } | undefined {
	if (!dateFrom && !dateTo) {
		return undefined;
	}
	const range: { gte?: Date; lte?: Date } = {};
	if (dateFrom) {
		range.gte = new Date(dateFrom);
	}
	if (dateTo) {
		const to = new Date(dateTo);
		to.setHours(23, 59, 59, 999);
		range.lte = to;
	}
	return range;
}

/**
 * Sentinel the filter dropdowns send for "not assigned to anyone". Radix
 * selects reserve the empty string, so `"none"` stands in for NULL and
 * `assignmentFilterValue` turns it back into the Prisma value to match on.
 */
export const UNASSIGNED_FILTER = "none";

/** Resolve a dropdown filter value to the value the column is matched against. */
export function assignmentFilterValue(value: string): string | null {
	return value === UNASSIGNED_FILTER ? null : value;
}

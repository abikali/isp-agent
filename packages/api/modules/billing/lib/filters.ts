/**
 * Prisma filter fragments for billing queries.
 *
 * Prisma's `NOT: { field: { equals: X } }` silently excludes rows
 * where the field is NULL. These helpers encode the correct OR pattern.
 */

/**
 * Exclude customers whose groupName matches a value (case-insensitive),
 * while keeping customers with NULL groupName.
 */
export function excludeGroupFilter(groupName: string) {
	return {
		OR: [
			{ groupName: null },
			{
				NOT: {
					groupName: {
						equals: groupName,
						mode: "insensitive" as const,
					},
				},
			},
		],
	};
}

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
 * A payment that "settles" a customer for a billing month — either real cash
 * came in (`paidAmount > 0`) or the customer was marked free for the month
 * (`freeAccount = true`). Stopped payments are excluded; they go through the
 * separate review/approval flow.
 *
 * Use this anywhere we ask "did this customer get handled this month?" so
 * paid counts and unpaid lists stay aligned. Without it, free-account rows
 * fall into a gap: `paidAmount > 0` excludes them from "paid", but a payment
 * row exists so they're not "unpaid" either — they vanish from collector
 * stats while the admin total still counts their invoice.
 */
export const SETTLED_PAYMENT = {
	stoppedAccount: false,
	OR: [{ paidAmount: { gt: 0 } }, { freeAccount: true }],
};

/**
 * A "pending stopped" payment: collector flagged the customer as stopped,
 * admin has not yet approved or declined. While in this state, the customer
 * should be hidden from collector lists and shown in the admin review queue.
 */
export const PENDING_STOPPED_PAYMENT = {
	stoppedAccount: true,
	reviewedAt: null,
} as const;

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
 * Customer statuses that should be collectible. Only ACTIVE customers are
 * billed, appear in collector lists, and count toward billing stats.
 * PENDING customers are excluded until their iRadius `Active` flag flips
 * back to 1 and their status is promoted to ACTIVE.
 */
export const BILLABLE_CUSTOMER_STATUSES = ["ACTIVE"] as const;

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
 * Case-insensitive search across common customer fields.
 * Returns a Prisma OR clause matching firstName, lastName, username, or mobile.
 */
export function customerSearchFilter(search: string) {
	return {
		OR: [
			{ firstName: { contains: search, mode: "insensitive" as const } },
			{ lastName: { contains: search, mode: "insensitive" as const } },
			{ username: { contains: search, mode: "insensitive" as const } },
			{ mobile: { contains: search, mode: "insensitive" as const } },
			{ phone: { contains: search, mode: "insensitive" as const } },
		],
	};
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

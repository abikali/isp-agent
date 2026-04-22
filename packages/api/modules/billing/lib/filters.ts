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

/** Hardcoded filter for the most common case: exclude "free" group. */
export const EXCLUDE_FREE_GROUP = excludeGroupFilter("free");

/** Exclude stopped payment records from billing aggregations. */
export const EXCLUDE_STOPPED = { stoppedAccount: false } as const;

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

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
 * Customer statuses that should be collectible. PENDING covers reactivated
 * customers whose iRadius `Active` flag hasn't flipped back to 1 yet — they
 * still owe and should appear in collector lists.
 *
 * Note: `deriveStatus` also maps dormant (non-archived, non-blocked, Active=0)
 * customers to PENDING. Those must not be billable — use `hasBilledInvoiceFilter`
 * alongside this to require an invoice in the collection window.
 */
export const BILLABLE_CUSTOMER_STATUSES = ["ACTIVE", "PENDING"] as const;

/**
 * Require the customer to have at least one `customer_invoice` row whose
 * (year, month) matches one of the supplied months. Paired with
 * `BILLABLE_CUSTOMER_STATUSES` this excludes dormant PENDING customers
 * whose iRadius billing has gone silent — there is nothing to collect
 * for months iRadius never issued an invoice for.
 */
export function hasBilledInvoiceFilter(
	months: readonly { year: number; month: number }[],
) {
	if (months.length === 0) {
		return undefined;
	}
	return {
		invoices: {
			some: {
				OR: months.map((m) => ({ year: m.year, month: m.month })),
			},
		},
	};
}

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

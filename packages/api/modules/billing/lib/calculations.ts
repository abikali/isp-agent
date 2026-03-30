/**
 * Centralized billing calculation helpers.
 * All balance/amount formulas live here so they stay consistent.
 */

/** Extract a numeric sum from a Prisma aggregate result, defaulting to 0. */
export function sumOrZero(agg: { _sum: { paidAmount?: number | null } }) {
	return agg._sum.paidAmount ?? 0;
}

/** Extract a numeric sum from a Prisma aggregate on the `amount` field. */
export function sumAmountOrZero(agg: { _sum: { amount?: number | null } }) {
	return agg._sum.amount ?? 0;
}

/**
 * Calculate the monthly amount due for a customer.
 * Formula: base + iptv + realIp - discount
 * where base = monthlyRate ?? plan.monthlyPrice ?? 0.
 */
export function customerMonthlyDue(customer: {
	monthlyRate?: number | null;
	iptvPrice?: number | null;
	realIpPrice?: number | null;
	discount?: number | null;
	plan?: { monthlyPrice?: number | null } | null;
}): number {
	const base = customer.monthlyRate ?? customer.plan?.monthlyPrice ?? 0;
	return (
		base +
		(customer.iptvPrice ?? 0) +
		(customer.realIpPrice ?? 0) -
		(customer.discount ?? 0)
	);
}

/**
 * Calculate the net balance a collector currently holds.
 * Balance = total collected - total handed off.
 * Can be negative if over-handoff occurred (admin error).
 */
export function collectorBalance(
	totalCollected: number,
	totalHandedOff: number,
): number {
	return totalCollected - totalHandedOff;
}

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
 * Calculate the net balance a collector currently holds.
 * This is the amount of cash still physically with the collector:
 * pending payments minus what they've already handed off.
 */
export function calculateInHandBalance(
	pendingTotal: number,
	handedOffTotal: number,
): number {
	return Math.max(0, pendingTotal - handedOffTotal);
}

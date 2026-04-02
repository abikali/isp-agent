/**
 * Shared billing query builders.
 *
 * Every view of collector balances, "customers due", and "unpaid customers"
 * MUST go through these helpers so the numbers stay consistent across
 * procedures (collector-balance, collector-stats, list-collectors, payment-stats, etc.).
 */

import type { PermissionContext } from "@repo/api/lib/permission";
import { resolveCollectorScope } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { collectorBalance, sumAmountOrZero, sumOrZero } from "./calculations";
import { EXCLUDE_FREE_GROUP } from "./filters";

// ── Collector Balance ────────────────────────────────────────────

interface CollectorBalanceResult {
	totalCollected: number;
	totalHandedOff: number;
	balance: number;
}

/**
 * Fetch the cash balance for a single collector.
 *
 * Balance = physical cash collected (workerId: null) − cash handed off.
 * This is intentionally NOT dealer-scoped: cash is cash regardless of
 * which dealer the customer belongs to.
 */
export async function fetchCollectorBalance(
	organizationId: string,
	collectorId: string,
): Promise<CollectorBalanceResult> {
	const [paymentsAgg, collectionsAgg] = await Promise.all([
		db.payment.aggregate({
			where: {
				organizationId,
				collectorId,
				status: "COLLECTED",
				workerId: null,
			},
			_sum: { paidAmount: true },
		}),
		db.cashCollection.aggregate({
			where: { organizationId, collectorId },
			_sum: { amount: true },
		}),
	]);

	const totalCollected = sumOrZero(paymentsAgg);
	const totalHandedOff = sumAmountOrZero(collectionsAgg);

	return {
		totalCollected,
		totalHandedOff,
		balance: collectorBalance(totalCollected, totalHandedOff),
	};
}

/**
 * Fetch cash balances for multiple collectors in batch (two groupBy queries).
 * Returns Maps keyed by collectorId.
 */
export async function fetchCollectorBalanceBatch(
	organizationId: string,
	collectorIds: string[],
): Promise<{
	collectedMap: Map<string, number>;
	handedOffMap: Map<string, number>;
}> {
	const [collectedByCollector, handoffsByCollector] = await Promise.all([
		db.payment.groupBy({
			by: ["collectorId"],
			where: {
				organizationId,
				collectorId: { in: collectorIds },
				status: "COLLECTED",
				workerId: null,
			},
			_sum: { paidAmount: true },
		}),
		db.cashCollection.groupBy({
			by: ["collectorId"],
			where: {
				organizationId,
				collectorId: { in: collectorIds },
			},
			_sum: { amount: true },
		}),
	]);

	const collectedMap = new Map(
		collectedByCollector.map((c) => [
			c.collectorId,
			c._sum.paidAmount ?? 0,
		]),
	);
	const handedOffMap = new Map(
		handoffsByCollector.map((c) => [c.collectorId, c._sum.amount ?? 0]),
	);

	return { collectedMap, handedOffMap };
}

// ── Customers Due This Month ─────────────────────────────────────

/**
 * Build a Prisma `where` clause for "customers due this billing month".
 *
 * A customer is "due" if:
 *   - They are ACTIVE and not in the free group, AND
 *   - Their billingExpiresAt falls within the month range, OR
 *   - They already have a COLLECTED payment for this month
 *     (meaning they were due and already paid — their expiry moved forward).
 */
export function customersDueThisMonthWhere(
	organizationId: string,
	billingMonthId: string,
	monthRange: { gte: Date; lte: Date },
	opts?: {
		collectorId?: string;
		collectorIds?: string[];
		dealerFilter?: Record<string, unknown>;
	},
) {
	const where: Record<string, unknown> = {
		organizationId,
		...EXCLUDE_FREE_GROUP,
		AND: [
			{
				OR: [
					// Unpaid customers due this month (active, billing expiry in range, no payment)
					{
						status: "ACTIVE",
						billingExpiresAt: monthRange,
						payments: { none: { billingMonthId } },
					},
					// Customers who actually paid real money (any status — covers
					// stopped-with-pay, free-with-pay, and normal payments)
					{
						payments: {
							some: { billingMonthId, paidAmount: { gt: 0 } },
						},
					},
				],
			},
		],
	};

	if (opts?.collectorId) {
		where["collectorId"] = opts.collectorId;
	}
	if (opts?.collectorIds) {
		where["collectorId"] = { in: opts.collectorIds };
	}
	if (opts?.dealerFilter) {
		Object.assign(where, opts.dealerFilter);
	}

	return where;
}

// ── Unpaid Customers ─────────────────────────────────────────────

/**
 * Build a Prisma `where` clause for "unpaid customers this billing month".
 *
 * Uses `billingExpiresAt: { lte: monthRange.lte }` (NOT `monthRange`) so that
 * customers who were due in PREVIOUS months and are still unpaid (past-due)
 * are included. This is the canonical definition used everywhere.
 */
export function unpaidCustomersWhere(
	organizationId: string,
	billingMonthId: string,
	monthRange: { gte: Date; lte: Date },
	opts?: {
		collectorId?: string;
		dealerFilter?: Record<string, unknown>;
	},
) {
	const where: Record<string, unknown> = {
		organizationId,
		status: "ACTIVE",
		...EXCLUDE_FREE_GROUP,
		billingExpiresAt: { lte: monthRange.lte },
		payments: {
			none: {
				billingMonthId,
			},
		},
	};

	if (opts?.collectorId) {
		where["collectorId"] = opts.collectorId;
	}
	if (opts?.dealerFilter) {
		Object.assign(where, opts.dealerFilter);
	}

	return where;
}

// ── Paid Customers Count ─────────────────────────────────────────

/**
 * Count distinct customers with a COLLECTED payment in a billing month.
 */
export async function countPaidCustomers(
	organizationId: string,
	billingMonthId: string,
	extraWhere?: Record<string, unknown>,
): Promise<number> {
	const ids = await db.payment.findMany({
		where: {
			organizationId,
			billingMonthId,
			status: "COLLECTED",
			...extraWhere,
		},
		select: { customerId: true },
		distinct: ["customerId"],
	});
	return ids.length;
}

// ── Collector Name Resolution ────────────────────────────────────

/**
 * Fetch employee names for a list of collector IDs.
 * Returns a Map<collectorId, name>.
 */
// ── Collector Scope ─────────────────────────────────────────────

/**
 * Apply collector scope filtering to a where clause.
 * If the user has "own" scope, restricts to their employeeId.
 * Otherwise allows an explicit collectorId filter from input.
 */
export async function applyCollectorScope(
	where: Record<string, unknown>,
	permCtx: PermissionContext,
	inputCollectorId?: string | null,
): Promise<void> {
	const { scope, employeeId } = await resolveCollectorScope(permCtx);
	if (scope === "own" && employeeId) {
		where["collectorId"] = employeeId;
	} else if (inputCollectorId) {
		where["collectorId"] = inputCollectorId;
	}
}

// ── Collector Name Resolution ───────────────────────────────────

export async function resolveCollectorNames(
	collectorIds: string[],
): Promise<Map<string, string>> {
	if (collectorIds.length === 0) {
		return new Map();
	}
	const collectors = await db.employee.findMany({
		where: { id: { in: collectorIds } },
		select: { id: true, name: true },
	});
	return new Map(collectors.map((c) => [c.id, c.name]));
}

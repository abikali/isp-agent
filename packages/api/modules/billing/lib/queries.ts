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
import { BILLABLE_CUSTOMER_STATUSES, EXCLUDE_FREE_GROUP } from "./filters";
import { yearMonthToNum } from "./resolve-month";

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

// ── Relevant Billing Months ──────────────────────────────────────

/**
 * Billing months ≤ (upToYear, upToMonth) for the org. The full set of months
 * unpaid-list aggregation visits — shared with collector/payment stats so
 * their counts align with the unpaid list.
 */
export async function fetchRelevantBillingMonths(
	organizationId: string,
	upToYear: number,
	upToMonth: number,
): Promise<{ id: string; year: number; month: number }[]> {
	const months = await db.billingMonth.findMany({
		where: { organizationId },
		select: { id: true, year: true, month: true },
		orderBy: [{ year: "asc" }, { month: "asc" }],
	});
	const cap = yearMonthToNum(upToYear, upToMonth);
	return months.filter((bm) => yearMonthToNum(bm.year, bm.month) <= cap);
}

// ── Customers Due This Month ─────────────────────────────────────

/**
 * Build a Prisma `where` clause for "customers due this billing month".
 *
 * A customer is "due" if we billed them for this month (an invoice row
 * exists) — paid or not — OR they recorded a payment for this month
 * (defensive catch for customers billed outside the normal flow).
 */
export function customersDueThisMonthWhere(
	organizationId: string,
	billingMonthId: string,
	_monthRange: { gte: Date; lte: Date },
	opts: {
		/** One collector (string) or a batch (string[]) — both produce the right Prisma clause. */
		collectorId?: string | string[];
		dealerFilter?: Record<string, unknown>;
		/** Billing months to consider (typically just the active month). */
		relevantMonths: readonly { year: number; month: number }[];
	},
) {
	const where: Record<string, unknown> = {
		organizationId,
		...EXCLUDE_FREE_GROUP,
		OR: [
			{
				status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
				invoices: {
					some: {
						OR: opts.relevantMonths.map((m) => ({
							year: m.year,
							month: m.month,
						})),
					},
				},
			},
			{
				payments: {
					some: { billingMonthId, paidAmount: { gt: 0 } },
				},
			},
		],
	};

	if (opts.collectorId !== undefined) {
		where["collectorId"] = Array.isArray(opts.collectorId)
			? { in: opts.collectorId }
			: opts.collectorId;
	}
	if (opts.dealerFilter) {
		Object.assign(where, opts.dealerFilter);
	}

	return where;
}

// ── Unpaid Customers ─────────────────────────────────────────────

/**
 * Build a Prisma `where` clause for "customers with any unpaid invoice across
 * the relevant months." Each relevant month produces a sub-OR: customer has
 * an invoice for that month AND no payment for that month's billing_cycle.
 * A match in any month qualifies the customer as unpaid.
 */
export function unpaidCustomersWhere(
	organizationId: string,
	_billingMonthId: string,
	_monthRange: { gte: Date; lte: Date },
	opts: {
		collectorId?: string;
		dealerFilter?: Record<string, unknown>;
		/** Must include every month whose unpaid invoices should count. */
		relevantMonths: readonly {
			id: string;
			year: number;
			month: number;
		}[];
	},
) {
	const where: Record<string, unknown> = {
		organizationId,
		status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
		...EXCLUDE_FREE_GROUP,
		OR: opts.relevantMonths.map((m) => ({
			invoices: {
				some: { year: m.year, month: m.month },
			},
			payments: {
				none: { billingMonthId: m.id },
			},
		})),
	};

	if (opts.collectorId) {
		where["collectorId"] = opts.collectorId;
	}
	if (opts.dealerFilter) {
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

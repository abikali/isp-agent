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
import {
	collectorBalance,
	sumAmountOrZero,
	sumOrZero,
	type UnpaidInvoiceRow,
} from "./calculations";
import {
	assignmentFilterValue,
	BILLABLE_CUSTOMER_STATUSES,
	excludeGroupFilter,
	LEDGER_CASH,
	NOT_VOIDED,
	PENDING_STOPPED_PAYMENT,
	SETTLED_PAYMENT,
} from "./filters";
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
			where: { organizationId, collectorId, ...LEDGER_CASH },
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
				...LEDGER_CASH,
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

// ── Worker Balance ───────────────────────────────────────────────

/**
 * Fetch the cash balance for a single worker.
 *
 * A worker's wallet is driven ENTIRELY by the cash ledger, matching legacy
 * `worker.php` exactly: `wallet = −1 × Σ(john_collection)`. The cash a worker
 * pockets (installs, new-user setup) arrives as NEGATIVE `CashCollection` rows
 * and handoffs/expense deductions as POSITIVE rows, so the signed ledger sum
 * already captures everything. Balance = −Σ cashCollection.amount.
 *
 * We deliberately do NOT add worker-attributed `Payment` rows. In legacy,
 * `john_payment.worker` is the customer's *assigned technician*, not whoever
 * collected the cash (`john_payment.collector`) — those monthly bills are
 * collected by collectors and never touch the worker's wallet. Counting them
 * here double-attributed a collector's cash onto the worker and broke parity
 * with legacy after every billing sync.
 *
 * Intentionally NOT dealer-scoped: cash is cash.
 */
export async function fetchWorkerBalance(
	organizationId: string,
	workerId: string,
): Promise<CollectorBalanceResult> {
	const collectionsAgg = await db.cashCollection.aggregate({
		where: { organizationId, collectorId: workerId, ...LEDGER_CASH },
		_sum: { amount: true },
	});

	const totalHandedOff = sumAmountOrZero(collectionsAgg);

	return {
		totalCollected: 0,
		totalHandedOff,
		balance: collectorBalance(0, totalHandedOff),
	};
}

/**
 * Fetch cash balances for multiple workers in batch (two groupBy queries).
 * Returns Maps keyed by workerId. See `fetchWorkerBalance` for the formula.
 */
export async function fetchWorkerBalanceBatch(
	organizationId: string,
	workerIds: string[],
): Promise<{
	collectedMap: Map<string, number>;
	handedOffMap: Map<string, number>;
}> {
	const handoffsByWorker = await db.cashCollection.groupBy({
		by: ["collectorId"],
		where: {
			organizationId,
			collectorId: { in: workerIds },
			...LEDGER_CASH,
		},
		_sum: { amount: true },
	});

	// Workers have no separate "collected" term — the wallet is driven solely
	// by the signed cash ledger (see `fetchWorkerBalance`).
	const collectedMap = new Map<string, number>();
	const handedOffMap = new Map(
		handoffsByWorker.map((c) => [c.collectorId, c._sum.amount ?? 0]),
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

// ── Unpaid-invoice resolution (multi-month settlement) ───────────

/**
 * Resolve a single customer's currently-unpaid invoices, oldest first, each
 * mapped to the billing month it settles. "Unpaid" mirrors the list-unpaid
 * derivation: an invoice is owed when its (customer, billingMonth) has no
 * SETTLED_PAYMENT. `billedMonthCount` is how many (non-voided) invoices the
 * customer has across the relevant window — used to tell "fully paid" (billed
 * but nothing unpaid → duplicate) from "never billed" (addon-only collection).
 */
export async function fetchCustomerUnpaidInvoices(
	organizationId: string,
	customerId: string,
	upToYear: number,
	upToMonth: number,
): Promise<{ unpaid: UnpaidInvoiceRow[]; billedMonthCount: number }> {
	const relevantMonths = await fetchRelevantBillingMonths(
		organizationId,
		upToYear,
		upToMonth,
	);
	if (relevantMonths.length === 0) {
		return { unpaid: [], billedMonthCount: 0 };
	}
	const billingMonthIdByYM = new Map<string, string>();
	for (const m of relevantMonths) {
		billingMonthIdByYM.set(`${m.year}-${m.month}`, m.id);
	}
	const relevantMonthIds = relevantMonths.map((m) => m.id);

	const invoices = await db.customerInvoice.findMany({
		where: {
			organizationId,
			customerId,
			...NOT_VOIDED,
			OR: relevantMonths.map((m) => ({ year: m.year, month: m.month })),
		},
		select: {
			id: true,
			year: true,
			month: true,
			total: true,
			totalWithTax: true,
		},
	});
	if (invoices.length === 0) {
		return { unpaid: [], billedMonthCount: 0 };
	}

	const settled = await db.payment.findMany({
		where: {
			organizationId,
			customerId,
			billingMonthId: { in: relevantMonthIds },
			...SETTLED_PAYMENT,
		},
		select: { billingMonthId: true },
	});
	const settledMonthIds = new Set(settled.map((p) => p.billingMonthId));

	const unpaid: UnpaidInvoiceRow[] = [];
	for (const inv of invoices) {
		const billingMonthId = billingMonthIdByYM.get(
			`${inv.year}-${inv.month}`,
		);
		if (!billingMonthId || settledMonthIds.has(billingMonthId)) {
			continue;
		}
		unpaid.push({
			invoiceId: inv.id,
			billingMonthId,
			year: inv.year,
			month: inv.month,
			amount: inv.totalWithTax > 0 ? inv.totalWithTax : inv.total,
		});
	}
	unpaid.sort(
		(a, b) =>
			yearMonthToNum(a.year, a.month) - yearMonthToNum(b.year, b.month),
	);
	return { unpaid, billedMonthCount: invoices.length };
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
		// Exclude soft-deleted customers (e.g. removed from iRadius or moved to
		// another dealer's subtree) — they keep their invoice rows but must not
		// surface in any collector-facing list.
		deletedAt: null,
		// Exclude the "free" group. They are never billed (`generate-invoices`
		// skips them) and the collect list hides them, so they must not inflate
		// "due this month" counts. Migration-imported invoices can otherwise
		// leave free-group customers with stray invoice rows.
		AND: [excludeGroupFilter("free")],
		// Pending-stop customers are in admin-review limbo — not "due" to
		// anyone until admin resolves the review.
		NOT: {
			payments: {
				some: { billingMonthId, ...PENDING_STOPPED_PAYMENT },
			},
		},
		OR: [
			{
				status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
				invoices: {
					some: {
						...NOT_VOIDED,
						OR: opts.relevantMonths.map((m) => ({
							year: m.year,
							month: m.month,
						})),
					},
				},
			},
			{
				payments: {
					some: { billingMonthId, ...SETTLED_PAYMENT },
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
	const relevantMonthIds = opts.relevantMonths.map((m) => m.id);
	const where: Record<string, unknown> = {
		organizationId,
		status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
		// Exclude soft-deleted customers (e.g. removed from iRadius or moved to
		// another dealer's subtree) — they keep their invoice rows but must not
		// surface in any collector-facing list.
		deletedAt: null,
		// Exclude the "free" group to match the collect list (which hides them
		// via `excludeGroupName: "free"`) and `generate-invoices` (which never
		// bills them). Stray migration-imported invoices must not surface them.
		AND: [excludeGroupFilter("free")],
		// Hide customers with a pending-stop payment in any relevant month —
		// they're in admin review, not truly "unpaid".
		NOT: {
			payments: {
				some: {
					billingMonthId: { in: relevantMonthIds },
					...PENDING_STOPPED_PAYMENT,
				},
			},
		},
		OR: opts.relevantMonths.map((m) => ({
			invoices: {
				some: { year: m.year, month: m.month, ...NOT_VOIDED },
			},
			payments: {
				none: { billingMonthId: m.id, ...SETTLED_PAYMENT },
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
 * Count distinct customers matched by a Payment `where` clause.
 * Uses `groupBy` to push distinct-on into Postgres rather than fetching
 * full rows and deduping in JS.
 */
export async function countDistinctCustomersWithPayments(
	where: Record<string, unknown>,
): Promise<number> {
	const groups = await db.payment.groupBy({
		by: ["customerId"],
		where,
	});
	return groups.length;
}

/**
 * Count distinct customers settled for a billing month.
 *
 * "Settled" = a COLLECTED, non-stopped payment with either real cash
 * (`paidAmount > 0`) or `freeAccount: true`. Bakes `SETTLED_PAYMENT` in so
 * every caller gets the same definition of "paid this month".
 */
export async function countPaidCustomers(
	organizationId: string,
	billingMonthId: string,
	extraWhere?: Record<string, unknown>,
): Promise<number> {
	return countDistinctCustomersWithPayments({
		organizationId,
		billingMonthId,
		status: "COLLECTED",
		...SETTLED_PAYMENT,
		...extraWhere,
	});
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
 *
 * `via: "customer"` writes the filter onto `customer.collectorId` (the
 * customer's *current* collector), merging with any existing `customer`
 * relation filter on the where. Use this for performance/progress metrics
 * so reassignment reattributes correctly.
 *
 * `via: "payment"` (default) writes onto the row's `collectorId` directly —
 * appropriate when filtering Customer rows, or when scoping a Payment query
 * by who actually handled the cash (cash audit views).
 */
export async function applyCollectorScope(
	where: Record<string, unknown>,
	permCtx: PermissionContext,
	inputCollectorId?: string | null,
	options?: { via?: "payment" | "customer" },
): Promise<void> {
	const { scope, employeeId } = await resolveCollectorScope(permCtx);
	const target =
		scope === "own" && employeeId
			? employeeId
			: inputCollectorId
				? inputCollectorId
				: null;
	if (!target) {
		return;
	}
	// `"none"` filters for customers with no collector at all.
	const value = assignmentFilterValue(target);
	if (options?.via === "customer") {
		const existing = (where["customer"] as Record<string, unknown>) ?? {};
		where["customer"] = { ...existing, collectorId: value };
		return;
	}
	where["collectorId"] = value;
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

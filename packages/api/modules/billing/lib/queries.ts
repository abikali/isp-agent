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
import {
	COVERING_PAYMENT,
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
	monthSettled,
} from "./settlement";

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
 * Resolve a single customer's currently-owed invoices, oldest first, each
 * mapped to the billing month it settles. Amount-aware: a partially-paid
 * month stays in the list with `amount` = what is still owed (invoice total
 * minus coverage), so the allocator tops months up instead of double-charging
 * them. Fully-covered and free-waived months drop out. `billedMonthCount` is
 * how many (non-voided) invoices the customer has across the relevant window
 * — used to tell "fully paid" (billed but nothing owed → duplicate) from
 * "never billed" (addon-only collection).
 *
 * Accepts a Prisma transaction client so `createPayment` can recompute the
 * owed set under its per-customer advisory lock (the race guard that replaced
 * the old `invoiceId @unique` constraint).
 */
export async function fetchCustomerUnpaidInvoices(
	organizationId: string,
	customerId: string,
	upToYear: number,
	upToMonth: number,
	client: Pick<typeof db, "customerInvoice" | "payment"> = db,
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

	const invoices = await client.customerInvoice.findMany({
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

	const coverage = await fetchCoverageMap(
		client,
		organizationId,
		relevantMonthIds,
		[customerId],
	);

	const unpaid: UnpaidInvoiceRow[] = [];
	for (const inv of invoices) {
		const billingMonthId = billingMonthIdByYM.get(
			`${inv.year}-${inv.month}`,
		);
		if (!billingMonthId) {
			continue;
		}
		const remaining = monthRemaining(
			invoiceAmount(inv),
			coverage.get(coverageKey(customerId, billingMonthId)),
		);
		if (remaining <= 0) {
			continue;
		}
		unpaid.push({
			invoiceId: inv.id,
			billingMonthId,
			year: inv.year,
			month: inv.month,
			amount: remaining,
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

// ── Month Settlement Stats (paid / unpaid customer counts) ───────

export interface CustomerSettlementRow {
	customerId: string;
	collectorId: string | null;
	/** Customer is in a billable status (counts toward "unpaid" surfaces). */
	billable: boolean;
	/** The active billing month is fully covered (or free-waived). */
	activeSettled: boolean;
	/** Some relevant month still has money owed on its invoice. */
	hasRemaining: boolean;
}

/**
 * Amount-aware paid/unpaid classification per customer, replacing the old
 * `unpaidCustomersWhere` / `countPaidCustomers` pair. Those were row-existence
 * Prisma filters, which is exactly the partial-payment bug: a $10 payment on
 * a $50 invoice moved the customer from "unpaid" to "paid". Prisma cannot
 * compare a payment sum against a related invoice total, so this fetches slim
 * invoice + payment rows and settles the arithmetic in JS (same shape as
 * list-unpaid, which stays the reference implementation).
 *
 * `customerWhere` carries the caller's scoping (dealer, collector,
 * deletedAt, pending-stop exclusion, free-group exclusion) but NOT a status
 * filter — "paid" deliberately counts any customer whose month is covered,
 * while "unpaid" surfaces only billable ones; use the `billable` flag.
 */
export async function fetchMonthSettlementStats(opts: {
	organizationId: string;
	relevantMonths: readonly { id: string; year: number; month: number }[];
	activeMonthId: string;
	customerWhere: Record<string, unknown>;
}): Promise<CustomerSettlementRow[]> {
	const { organizationId, relevantMonths, activeMonthId, customerWhere } =
		opts;
	if (relevantMonths.length === 0) {
		return [];
	}
	const billingMonthIdByYM = new Map<string, string>();
	for (const m of relevantMonths) {
		billingMonthIdByYM.set(`${m.year}-${m.month}`, m.id);
	}
	const relevantMonthIds = relevantMonths.map((m) => m.id);
	const billableStatuses = new Set<string>([...BILLABLE_CUSTOMER_STATUSES]);

	const INVOICE_FETCH_CAP = 50_000;
	const invoices = await db.customerInvoice.findMany({
		where: {
			organizationId,
			...NOT_VOIDED,
			OR: relevantMonths.map((m) => ({ year: m.year, month: m.month })),
			customer: customerWhere,
		},
		select: {
			customerId: true,
			year: true,
			month: true,
			total: true,
			totalWithTax: true,
			customer: { select: { collectorId: true, status: true } },
		},
		take: INVOICE_FETCH_CAP,
	});

	const customerIds = [...new Set(invoices.map((i) => i.customerId))];
	const coverage = await fetchCoverageMap(
		db,
		organizationId,
		relevantMonthIds,
		customerIds,
	);

	const byCustomer = new Map<string, CustomerSettlementRow>();
	for (const inv of invoices) {
		const billingMonthId = billingMonthIdByYM.get(
			`${inv.year}-${inv.month}`,
		);
		if (!billingMonthId) {
			continue;
		}
		let row = byCustomer.get(inv.customerId);
		if (!row) {
			row = {
				customerId: inv.customerId,
				collectorId: inv.customer.collectorId,
				billable: billableStatuses.has(inv.customer.status),
				activeSettled: false,
				hasRemaining: false,
			};
			byCustomer.set(inv.customerId, row);
		}
		const cov = coverage.get(coverageKey(inv.customerId, billingMonthId));
		const amount = invoiceAmount(inv);
		if (monthRemaining(amount, cov) > 0) {
			row.hasRemaining = true;
		}
		if (billingMonthId === activeMonthId && monthSettled(amount, cov)) {
			row.activeSettled = true;
		}
	}

	// Customers who paid for the active month without ever being billed for
	// it (addon-only collections, pre-invoice-era imports). Nothing frozen to
	// compare against, so any real cash or a free waiver counts as settled —
	// mirrors the old behavior for these edge rows.
	const invoicelessPayments = await db.payment.findMany({
		where: {
			organizationId,
			billingMonthId: activeMonthId,
			...COVERING_PAYMENT,
			OR: [{ paidAmount: { gt: 0 } }, { freeAccount: true }],
			customer: customerWhere,
		},
		select: {
			customerId: true,
			customer: { select: { collectorId: true, status: true } },
		},
	});
	const billedActiveCustomers = new Set(
		invoices
			.filter(
				(i) =>
					billingMonthIdByYM.get(`${i.year}-${i.month}`) ===
					activeMonthId,
			)
			.map((i) => i.customerId),
	);
	for (const p of invoicelessPayments) {
		if (billedActiveCustomers.has(p.customerId)) {
			continue;
		}
		const existing = byCustomer.get(p.customerId);
		if (existing) {
			existing.activeSettled = true;
		} else {
			byCustomer.set(p.customerId, {
				customerId: p.customerId,
				collectorId: p.customer.collectorId,
				billable: billableStatuses.has(p.customer.status),
				activeSettled: true,
				hasRemaining: false,
			});
		}
	}

	return [...byCustomer.values()];
}

/**
 * The customer-side scoping shared by the settlement-stats callers: skip
 * soft-deleted customers, the never-billed "free" group, and customers whose
 * pending-stop review is in flight (admin limbo — neither paid nor unpaid).
 */
export function settlementStatsCustomerWhere(opts: {
	relevantMonthIds: string[];
	dealerFilter?: Record<string, unknown> | undefined;
	collectorId?: string | string[] | undefined;
}): Record<string, unknown> {
	const where: Record<string, unknown> = {
		deletedAt: null,
		AND: [excludeGroupFilter("free")],
		NOT: {
			payments: {
				some: {
					billingMonthId: { in: opts.relevantMonthIds },
					...PENDING_STOPPED_PAYMENT,
				},
			},
		},
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

/**
 * Every database read the finance module makes.
 *
 * Kept in one file so there is exactly one place to check when asking "where
 * does this number come from?" — the question the 2026-08 audit could not
 * answer for the old reports.
 */

import { db } from "@repo/database";
import { collectorBalance } from "../../billing/lib/calculations";
import {
	fetchCollectorBalanceBatch,
	fetchWorkerBalanceBatch,
} from "../../billing/lib/queries";
import {
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
} from "../../billing/lib/settlement";
import {
	classifyLedgerRow,
	isLegacyCurrency,
	LEGACY_CURRENCY_THRESHOLD,
	netOwed,
	round2,
} from "../../dealers/lib/ledger";
import {
	resolveCashRole,
	usesCollectorWallet,
} from "../../employees/lib/cash-role";
import { expenseDealerScope } from "../../expenses/lib/filters";
import { UNCLASSIFIED_LABEL } from "./categories";
import { matchRule } from "./classify";
import type { MoneyLine } from "./money-model";
import { WHOLESALE_CHARGE_TYPES } from "./money-model";
import type { Period } from "./period";

/** Only ACTIVE dealer scope is ever applied — a dealer must never see another
 *  dealer's money. `null` means the org is not dealer-scoped. */
export interface FinanceScope {
	organizationId: string;
	activeDealerId: string | null;
}

/**
 * The org's own iRadius dealer accounts: the master it operates as and its
 * internal lines (`IspDealer.internalLineOfOrganizationId`, LIBANCOM-FIBER
 * beside johnnyh). iRadius bills them for the org's OWN subscribers at an
 * internal transfer price — the retail money for those subscribers is already
 * in `fetchRetailRevenue` — so neither their charges nor their ledger rows are
 * dealer money.
 */
async function fetchOwnDealerIds(scope: FinanceScope): Promise<string[]> {
	const lines = await db.ispDealer.findMany({
		where: { internalLineOfOrganizationId: scope.organizationId },
		select: { id: true },
	});
	return [
		...(scope.activeDealerId ? [scope.activeDealerId] : []),
		...lines.map((line) => line.id),
	];
}

/**
 * Prisma fragment excluding the org's own dealer accounts. `NOT`/`notIn` on a
 * nullable column would also drop null rows, but `dealerId` is non-nullable on
 * both `dealer_charge` and `isp_dealer_account`, so this is safe.
 */
function excludeDealers(ids: string[]): { dealerId?: { notIn: string[] } } {
	return ids.length > 0 ? { dealerId: { notIn: ids } } : {};
}

/**
 * Retail revenue: what collectors actually took from subscribers.
 *
 * Read through the billing month rather than `paidAt`, because a payment
 * settles a cycle — money collected on 2 September for the August cycle is
 * August's revenue. Stopped-account rows are excluded: they are a review
 * signal, not a collection.
 */
export async function fetchRetailRevenue(
	scope: FinanceScope,
	period: Period,
): Promise<number> {
	if (period.months.length === 0) {
		return 0;
	}

	const result = await db.payment.aggregate({
		where: {
			organizationId: scope.organizationId,
			stoppedAccount: false,
			...(scope.activeDealerId
				? { customer: { dealerId: scope.activeDealerId } }
				: {}),
			billingMonth: {
				OR: period.months.map((m) => ({
					year: m.year,
					month: m.month,
				})),
			},
		},
		_sum: { paidAmount: true },
		_count: true,
	});

	return result._sum.paidAmount ?? 0;
}

/**
 * Wholesale revenue: what sub-dealers were charged for reselling our service.
 *
 * Mirrored from iRadius `DealerBillingLog`. Charges raised against the master
 * dealer are excluded at sync time — iRadius bills the operator for his own
 * subscribers at an internal transfer price, and counting it here would double
 * the revenue of every subscriber he already collects from directly.
 *
 * NOTE on dealer scoping: unlike every other query in this file, `dealerId`
 * here is the COUNTERPARTY being billed, not the owner of the row. Ownership
 * is `organizationId` alone. Filtering to `dealerId = activeDealerId` — the
 * shape used by `fetchRetailRevenue` and friends — would select exactly the
 * master's own internal-transfer rows and report zero wholesale revenue. The
 * master exclusion below is the correct guard, and it is belt-and-braces:
 * `syncDealerCharges` already refuses to store those rows. Internal lines are
 * excluded the same way — rows booked against a line before it was linked
 * would otherwise count the org's own fiber renewals as dealer income.
 */
export async function fetchWholesaleRevenue(
	scope: FinanceScope,
	period: Period,
): Promise<{
	charged: number;
	chargeCount: number;
	/** True when this organization has NO dealer-charge history at all, i.e.
	 *  the iRadius sync has never populated it. Distinguishes "wholesale earned
	 *  nothing" from "we cannot see wholesale" — reporting the second as the
	 *  first understates income by roughly half and recreates the exact
	 *  false-loss this module exists to fix. */
	neverSynced: boolean;
}> {
	// The org's own dealers are the counterparty on its internal-transfer rows.
	const notOwn = excludeDealers(await fetchOwnDealerIds(scope));

	const [charges, everSynced] = await Promise.all([
		db.dealerCharge.aggregate({
			where: {
				organizationId: scope.organizationId,
				...notOwn,
				type: { in: [...WHOLESALE_CHARGE_TYPES] },
				operationDate: { gte: period.from, lt: period.to },
			},
			_sum: { debit: true },
			_count: true,
		}),
		db.dealerCharge.findFirst({
			where: { organizationId: scope.organizationId, ...notOwn },
			select: { id: true },
		}),
	]);

	return {
		charged: charges._sum.debit ?? 0,
		chargeCount: charges._count,
		neverSynced: everSynced === null,
	};
}

/**
 * Cash that dealers actually paid in during the period. CASH POSITION, never
 * revenue: the sale was recognised from `dealer_charge` when the dealer was
 * charged; this is the dealer settling what he owed.
 *
 * Source is the dealer receivable ledger (`isp_dealer_account`), not
 * `cash_collection`: a payment received at the office writes no cash-ledger
 * row at all, only the ledger debit. Rows are matched by dealer, not by
 * `organizationId` — dealers are global iRadius entities and the rows the
 * sync mirrors carry no organization. Only the wholesale operator has a
 * receivable ledger, so a reseller org sees zero.
 *
 * Bonuses, write-offs, in-kind settlements and credit deductions all lower
 * what a dealer owes without any cash arriving; `classifyLedgerRow` keeps
 * them out. 2023 rows are in Lebanese pounds and are skipped. The org's own
 * accounts (master and internal lines) are not dealers paying in.
 */
export async function fetchDealerPayments(
	scope: FinanceScope,
	period: Period,
): Promise<{ total: number; count: number }> {
	const org = await db.organization.findUnique({
		where: { id: scope.organizationId },
		select: { isWholesaleOperator: true },
	});
	if (!org?.isWholesaleOperator) {
		return { total: 0, count: 0 };
	}

	const rows = await db.ispDealerAccount.findMany({
		where: {
			debit: { gt: 0 },
			operationDate: { gte: period.from, lt: period.to },
			...excludeDealers(await fetchOwnDealerIds(scope)),
		},
		select: { credit: true, debit: true, comment: true },
	});

	let total = 0;
	let count = 0;
	for (const row of rows) {
		if (isLegacyCurrency(row.debit)) {
			continue;
		}
		if (classifyLedgerRow(row) !== "payment") {
			continue;
		}
		total += row.debit;
		count++;
	}
	return { total: Math.round(total * 100) / 100, count };
}

/**
 * Costs and owner draws, resolved through the org's money map.
 *
 * Resolution order: the expense's own `financeCategoryId` if an admin already
 * set one, otherwise the first matching rule, otherwise unclassified. An
 * unclassified cost is reported AS unclassified rather than folded into a
 * bucket, so the gap is visible and gets fixed.
 *
 * The ONE classifier for approved spending: the Money page (`fetchCostLines`)
 * and the Spending page (`expenses.overview`) both read it, so "Spent" means
 * the same number on both — COST lines only, owner draws apart.
 *
 * @param expenseWhere  the caller's scope (`buildExpenseWhere` /
 *                      `expenseDealerScope`); status and period are added here
 */
export async function classifyApprovedExpenses(
	organizationId: string,
	expenseWhere: Record<string, unknown>,
	period: { from: Date; to: Date },
): Promise<MoneyLine[]> {
	const [expenses, categories, rules] = await Promise.all([
		db.expense.findMany({
			where: {
				AND: [
					expenseWhere,
					{
						status: "APPROVED",
						createdAt: { gte: period.from, lt: period.to },
					},
				],
			},
			select: {
				id: true,
				amount: true,
				description: true,
				financeCategoryId: true,
			},
		}),
		db.financeCategory.findMany({
			where: { organizationId, archivedAt: null },
			select: { id: true, label: true, kind: true },
		}),
		db.financeRule.findMany({
			where: { organizationId },
			select: {
				id: true,
				pattern: true,
				matchType: true,
				financeCategoryId: true,
				priority: true,
			},
		}),
	]);

	const categoryById = new Map(categories.map((c) => [c.id, c]));
	const lines: MoneyLine[] = [];

	for (const expense of expenses) {
		let categoryId = expense.financeCategoryId;
		if (!categoryId) {
			categoryId =
				matchRule(expense.description, rules)?.financeCategoryId ??
				null;
		}

		const category = categoryId ? categoryById.get(categoryId) : undefined;

		lines.push({
			// An unclassified expense is still money out — it counts as a COST
			// so the profit figure is never flattered by our own ignorance. It
			// just carries a label that makes the gap obvious.
			kind: category?.kind === "DRAW" ? "DRAW" : "COST",
			label: category?.label ?? UNCLASSIFIED_LABEL,
			amount: expense.amount,
			categoryId: category?.id ?? null,
		});
	}

	return lines;
}

/**
 * The Money page's costs and draws. A claim belongs to its worker's dealer; a
 * direct row has no worker — it is the organization's own spending and is
 * always in scope, so an owner-entered cost cannot vanish from the P&L just
 * because the org has a master dealer account (`expenseDealerScope`).
 */
export async function fetchCostLines(
	scope: FinanceScope,
	period: Period,
): Promise<MoneyLine[]> {
	return classifyApprovedExpenses(
		scope.organizationId,
		{
			organizationId: scope.organizationId,
			...expenseDealerScope(scope.activeDealerId),
		},
		period,
	);
}

/**
 * What dealers still owe the operator: Σ(credit − debit) of the receivable
 * ledger per live dealer, recomputed rather than trusting the stored balance
 * (same basis as `dealers.overview` totals). Pre-2024 Lebanese-pound rows are
 * skipped. The org's own accounts (master and internal lines) are not
 * dealers. Null for a reseller org — only the operator has this ledger.
 */
export async function fetchDealersOwe(
	scope: FinanceScope,
): Promise<{ total: number; owingCount: number } | null> {
	const org = await db.organization.findUnique({
		where: { id: scope.organizationId },
		select: { isWholesaleOperator: true },
	});
	if (!org?.isWholesaleOperator) {
		return null;
	}
	const ownIds = await fetchOwnDealerIds(scope);
	const dealers = await db.ispDealer.findMany({
		where: {
			deletedAt: null,
			...(ownIds.length > 0 ? { id: { notIn: ownIds } } : {}),
		},
		select: { id: true },
	});
	const totals = await db.ispDealerAccount.groupBy({
		by: ["dealerId"],
		where: {
			dealerId: { in: dealers.map((d) => d.id) },
			credit: { lt: LEGACY_CURRENCY_THRESHOLD },
			debit: { lt: LEGACY_CURRENCY_THRESHOLD },
		},
		_sum: { credit: true, debit: true },
	});
	let total = 0;
	let owingCount = 0;
	for (const row of totals) {
		const owed = netOwed(row._sum.credit ?? 0, row._sum.debit ?? 0);
		total += owed;
		if (owed > 0) {
			owingCount++;
		}
	}
	return { total: round2(total), owingCount };
}

/**
 * One-off cash workers take from customers in the field: setup fees and
 * hardware on installs. The monthly subscription is NOT here — that is a
 * Payment row and lives in `fetchRetailRevenue`.
 *
 * Source is the cash ledger, where these land as NEGATIVE rows (a worker
 * pocketing cash raises what he owes — see billing/lib/cash-signs.ts), so the
 * sign is flipped.
 *
 * A NEW_USER_SETUP row written by the app bundles the hardware AND, when the
 * worker took it, the first subscription charge — which the same approval
 * also records as a Payment. Counting the whole row would count that
 * subscription twice, so for app-written rows only the linked request's
 * hardware total is taken. Rows imported from the legacy billing system have
 * no such link and are taken whole; legacy bundled the first month the same
 * way, so a pre-app month can be slightly high. No new rows of that kind are
 * created.
 */
export async function fetchFieldCash(
	scope: FinanceScope,
	period: Period,
): Promise<number> {
	const rows = await db.cashCollection.findMany({
		where: {
			organizationId: scope.organizationId,
			type: { in: ["NEW_USER_SETUP", "INSTALLATION_COST"] },
			collectedAt: { gte: period.from, lt: period.to },
			...(scope.activeDealerId
				? { collector: { dealerId: scope.activeDealerId } }
				: {}),
		},
		select: {
			amount: true,
			setupRequest: {
				select: {
					installations: { select: { price: true, quantity: true } },
				},
			},
		},
	});

	let total = 0;
	for (const row of rows) {
		const cash = -row.amount;
		if (row.setupRequest) {
			const hardware = row.setupRequest.installations.reduce(
				(sum, i) => sum + i.price * i.quantity,
				0,
			);
			// The row is never less than its hardware; the difference is the
			// subscription already counted as a Payment.
			total += Math.min(cash, hardware);
		} else {
			total += cash;
		}
	}
	return total;
}

/**
 * Cash that physically reached the office during the period.
 *
 * `fetchRetailRevenue` counts a payment the moment a collector records it —
 * the cash may still be in his pocket. This is the other half of that story:
 * HANDOFF ledger rows are the collector handing that cash in, so summing them
 * over the period answers "how much did the office actually receive?".
 *
 * Read by `collectedAt` on the calendar period, not by billing month: a
 * handoff is a physical event on a date, and one handoff routinely carries
 * cash from several cycles. So this is NOT "money in minus what is still
 * held" — that subtraction crosses cycles and would be wrong.
 *
 * Only HANDOFF counts. EXPENSE_DEDUCTION, STORE_PURCHASE and the rest lower a
 * holder's balance without any cash arriving at the office.
 */
export async function fetchHandedIn(
	scope: FinanceScope,
	period: Period,
): Promise<{ total: number; count: number }> {
	const result = await db.cashCollection.aggregate({
		where: {
			organizationId: scope.organizationId,
			type: "HANDOFF",
			collectedAt: { gte: period.from, lt: period.to },
			...(scope.activeDealerId
				? { collector: { dealerId: scope.activeDealerId } }
				: {}),
		},
		_sum: { amount: true },
		_count: true,
	});

	return { total: result._sum.amount ?? 0, count: result._count };
}

/**
 * Money the company is still owed by subscribers.
 *
 * Reads each invoice's own frozen `expiryDate`/total rather than the
 * customer's live values — see the billing conventions in CLAUDE.md. What a
 * month still owes is settlement-derived (billing/lib/settlement.ts): a
 * partially paid invoice contributes its REMAINDER, a fully covered or
 * free-waived month contributes nothing, and a $0 stopped row no longer
 * hides the whole invoice from receivables (the old `payment: null` filter
 * dropped $11.9k of open invoices that only carried stop-flag rows).
 */
export async function fetchReceivables(scope: FinanceScope) {
	const [rows, billingMonths] = await Promise.all([
		db.customerInvoice.findMany({
			where: {
				organizationId: scope.organizationId,
				voidedAt: null,
				// Soft-deleted customers are gone from every collect list;
				// their stale invoices are not money anyone will collect.
				customer: {
					deletedAt: null,
					...(scope.activeDealerId
						? { dealerId: scope.activeDealerId }
						: {}),
				},
			},
			select: {
				customerId: true,
				total: true,
				totalWithTax: true,
				year: true,
				month: true,
			},
		}),
		db.billingMonth.findMany({
			where: { organizationId: scope.organizationId },
			select: { id: true, year: true, month: true },
		}),
	]);
	const monthIdByYM = new Map(
		billingMonths.map((m) => [`${m.year}-${m.month}`, m.id]),
	);
	// Org-wide coverage in one query — the payment table is far smaller than
	// a bind-parameter list of every open customer id.
	const coverage = await fetchCoverageMap(
		db,
		scope.organizationId,
		billingMonths.map((m) => m.id),
	);

	let total = 0;
	let count = 0;
	const byMonth = new Map<
		string,
		{ year: number; month: number; amount: number; count: number }
	>();

	for (const row of rows) {
		const monthId = monthIdByYM.get(`${row.year}-${row.month}`);
		const remaining = monthRemaining(
			invoiceAmount(row),
			monthId
				? coverage.get(coverageKey(row.customerId, monthId))
				: undefined,
		);
		if (remaining <= 0) {
			continue;
		}
		total += remaining;
		count += 1;
		const key = `${row.year}-${row.month}`;
		const bucket = byMonth.get(key) ?? {
			year: row.year,
			month: row.month,
			amount: 0,
			count: 0,
		};
		bucket.amount += remaining;
		bucket.count += 1;
		byMonth.set(key, bucket);
	}

	return {
		total,
		count,
		byMonth: [...byMonth.values()].sort(
			(a, b) => a.year - b.year || a.month - b.month,
		),
	};
}

/**
 * Cash sitting with staff rather than in the office.
 *
 * This is a POSITION, not income — it is the number the old "net total" card
 * mistook for profit. It answers "who is holding my money right now?", which is
 * a real and useful question, just a different one from "did I make money?".
 *
 * The formula is NOT ours to invent: it is deliberately delegated to the
 * existing `fetchCollectorBalanceBatch` / `fetchWorkerBalanceBatch` helpers,
 * because the two roles genuinely settle differently and both formulas are
 * load-bearing for legacy parity.
 *
 *   collector: balance = cash he collected (workerId null) − what he handed in
 *   worker:    balance = −Σ cash ledger, matching legacy `worker.php` exactly.
 *              A worker's collected cash arrives as NEGATIVE ledger rows, so the
 *              signed sum already captures it; adding Payment rows here
 *              double-attributes a collector's cash onto the technician.
 *
 * Getting this wrong is not subtle: applying the worker formula to collectors
 * ignores everything they collected and reports the whole team as hundreds of
 * thousands of dollars in deficit.
 */
export async function fetchCashHeld(scope: FinanceScope) {
	const employees = await db.employee.findMany({
		where: {
			organizationId: scope.organizationId,
			status: "ACTIVE",
			deletedAt: null,
			...(scope.activeDealerId ? { dealerId: scope.activeDealerId } : {}),
			cashCollections: { some: {} },
		},
		select: {
			id: true,
			name: true,
			username: true,
			department: true,
			cashRole: true,
		},
	});

	if (employees.length === 0) {
		return { total: 0, holders: [] };
	}

	// The field role picks the formula: collectors (and collector & worker)
	// settle billing-round cash; workers settle on the ledger alone. Unset
	// roles fall back to billing department → collector.
	const collectorIds = employees
		.filter((e) => usesCollectorWallet(resolveCashRole(e)))
		.map((e) => e.id);
	const collectorWallet = new Set(collectorIds);
	const workerIds = employees
		.filter((e) => !collectorWallet.has(e.id))
		.map((e) => e.id);

	const [collectorBalances, workerBalances] = await Promise.all([
		collectorIds.length > 0
			? fetchCollectorBalanceBatch(scope.organizationId, collectorIds)
			: Promise.resolve({
					collectedMap: new Map<string, number>(),
					handedOffMap: new Map<string, number>(),
				}),
		workerIds.length > 0
			? fetchWorkerBalanceBatch(scope.organizationId, workerIds)
			: Promise.resolve({
					collectedMap: new Map<string, number>(),
					handedOffMap: new Map<string, number>(),
				}),
	]);

	const holders = employees
		.map((employee) => {
			const isCollector = collectorWallet.has(employee.id);
			const balances = isCollector ? collectorBalances : workerBalances;
			const collected = balances.collectedMap.get(employee.id) ?? 0;
			const handedOff = balances.handedOffMap.get(employee.id) ?? 0;

			return {
				employeeId: employee.id,
				name: employee.name || employee.username || "Unknown",
				amount: collectorBalance(collected, handedOff),
			};
		})
		.filter((h) => Math.abs(h.amount) > 0.005)
		.sort((a, b) => b.amount - a.amount);

	return {
		total: holders.reduce((sum, h) => sum + h.amount, 0),
		holders,
	};
}

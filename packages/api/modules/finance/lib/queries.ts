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
 */
export async function fetchWholesaleRevenue(
	scope: FinanceScope,
	period: Period,
): Promise<{
	charged: number;
	settled: number;
	chargeCount: number;
	/** True when this organization has NO dealer-charge history at all, i.e.
	 *  the iRadius sync has never populated it. Distinguishes "wholesale earned
	 *  nothing" from "we cannot see wholesale" — reporting the second as the
	 *  first understates income by roughly half and recreates the exact
	 *  false-loss this module exists to fix. */
	neverSynced: boolean;
}> {
	const [charges, settlements, everSynced] = await Promise.all([
		db.dealerCharge.aggregate({
			where: {
				organizationId: scope.organizationId,
				type: { in: [...WHOLESALE_CHARGE_TYPES] },
				operationDate: { gte: period.from, lt: period.to },
			},
			_sum: { debit: true },
			_count: true,
		}),
		db.dealerCharge.aggregate({
			where: {
				organizationId: scope.organizationId,
				type: { in: ["CREDIT", "REFUND", "TRANSFER COMMISSION"] },
				operationDate: { gte: period.from, lt: period.to },
			},
			_sum: { credit: true },
		}),
		db.dealerCharge.findFirst({
			where: { organizationId: scope.organizationId },
			select: { id: true },
		}),
	]);

	return {
		charged: charges._sum.debit ?? 0,
		settled: settlements._sum.credit ?? 0,
		chargeCount: charges._count,
		neverSynced: everSynced === null,
	};
}

/**
 * Costs and owner draws, resolved through the org's money map.
 *
 * Resolution order: the expense's own `financeCategoryId` if an admin already
 * set one, otherwise the first matching rule, otherwise unclassified. An
 * unclassified cost is reported AS unclassified rather than folded into a
 * bucket, so the gap is visible and gets fixed.
 */
export async function fetchCostLines(
	scope: FinanceScope,
	period: Period,
): Promise<MoneyLine[]> {
	const [expenses, categories, rules] = await Promise.all([
		db.expense.findMany({
			where: {
				organizationId: scope.organizationId,
				status: "APPROVED",
				createdAt: { gte: period.from, lt: period.to },
				...(scope.activeDealerId
					? { submittedBy: { dealerId: scope.activeDealerId } }
					: {}),
			},
			select: {
				id: true,
				amount: true,
				description: true,
				financeCategoryId: true,
			},
		}),
		db.financeCategory.findMany({
			where: {
				organizationId: scope.organizationId,
				archivedAt: null,
			},
			select: { id: true, label: true, kind: true },
		}),
		db.financeRule.findMany({
			where: { organizationId: scope.organizationId },
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
 * Money the company is still owed by subscribers.
 *
 * Reads each invoice's own frozen `expiryDate`/total rather than the customer's
 * live values — see the billing conventions in CLAUDE.md. An invoice with no
 * non-voided payment against it is unpaid.
 */
export async function fetchReceivables(scope: FinanceScope) {
	const rows = await db.customerInvoice.findMany({
		where: {
			organizationId: scope.organizationId,
			voidedAt: null,
			payment: null,
			...(scope.activeDealerId
				? { customer: { dealerId: scope.activeDealerId } }
				: {}),
		},
		select: { total: true, year: true, month: true },
	});

	let total = 0;
	const byMonth = new Map<
		string,
		{ year: number; month: number; amount: number; count: number }
	>();

	for (const row of rows) {
		total += row.total;
		const key = `${row.year}-${row.month}`;
		const bucket = byMonth.get(key) ?? {
			year: row.year,
			month: row.month,
			amount: 0,
			count: 0,
		};
		bucket.amount += row.total;
		bucket.count += 1;
		byMonth.set(key, bucket);
	}

	return {
		total,
		count: rows.length,
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
		},
	});

	if (employees.length === 0) {
		return { total: 0, holders: [] };
	}

	// A "collector" here means someone whose cash comes from billing rounds.
	// Everyone else settles on the worker formula.
	const collectorIds = employees
		.filter((e) => e.department === "BILLING")
		.map((e) => e.id);
	const workerIds = employees
		.filter((e) => e.department !== "BILLING")
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
			const isCollector = employee.department === "BILLING";
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

/**
 * Month-settlement derivation — the single definition of "is this billed
 * month paid off?".
 *
 * History: settlement used to be row-existence (`SETTLED_PAYMENT`: any
 * `paidAmount > 0` settles the month). A collector recording $10 against a
 * $50 invoice closed the whole month — the customer dropped off the unpaid
 * list, the $40 remainder existed nowhere, and `createPayment` refused a
 * follow-up collection ("already settled"). Measured before the fix
 * (2026-09-01): 510 customer-months short by ~$5.8k. Settlement is now an
 * amount comparison:
 *
 *     settled ⟺ freeAccount waiver exists
 *             ∨ Σ(paidAmount + discount) ≥ invoice total − ε
 *
 * Two rules every consumer must keep:
 *
 * 1. Key on (customerId, billingMonthId), NEVER on `Payment.invoiceId`.
 *    ~2k legacy-imported payments carry a billing month but no invoice link;
 *    keying on the invoice relation calls their months unpaid.
 * 2. `discount` counts toward coverage. The frozen invoice total already
 *    reflects the customer's standing discount; `Payment.discount` is the
 *    extra amount the collector waived on the doorstep — the month is done
 *    when cash + waiver cover the bill.
 *
 * Rows that never cover anything: stopped rows (separate review flow) and
 * debt rows (zero-cash visit logs). `SETTLED_PAYMENT` in filters.ts remains
 * for the has-cash-recorded guards (void/delete protection) and cash sums —
 * existence there is the correct question.
 */

import type { db } from "@repo/database";

/** 1-cent tolerance — currency round-trips through doubles. */
export const AMOUNT_EPSILON = 0.01;

/**
 * Months settled before this moment stay settled the way the old system
 * left them ("grandfathered"), even when the amounts don't add up.
 *
 * Why: the day the amount comparison shipped, reliably-paying customers
 * surfaced with months of "past due" — 65 customers pay a consistent
 * informal price below their frozen invoice (e.g. Nadia Tabet, $20 every
 * 1st against a $25 invoice) and the old row-existence logic had been
 * absorbing the gap for months. Those histories were closed out by
 * collectors under the old rules; reopening them retroactively floods the
 * collect lists with money nobody considers owed.
 *
 * So: a month with real pre-cutoff coverage keeps its legacy settlement.
 * The strict remainder rule applies as soon as ANY covering payment lands
 * on or after the cutoff — which also means topping up a grandfathered
 * month re-evaluates it strictly (covered so far + the new cash).
 */
export const LEGACY_SETTLEMENT_CUTOFF = new Date("2026-09-01T00:00:00Z");

/**
 * Payment rows that count toward covering a month. Broader than
 * SETTLED_PAYMENT on purpose: a zero-cash free waiver covers its month, and a
 * summed zero contributes nothing, so no paidAmount floor is needed.
 */
export const COVERING_PAYMENT = {
	stoppedAccount: false,
	debtAccount: false,
} as const;

export interface MonthCoverage {
	/** Σ(paidAmount + discount) over covering rows. */
	covered: number;
	/** A freeAccount row waives the month regardless of amount. */
	free: boolean;
	/** Any covering row recorded on/after LEGACY_SETTLEMENT_CUTOFF. */
	postCutoff: boolean;
}

export function coverageKey(customerId: string, billingMonthId: string) {
	return `${customerId}|${billingMonthId}`;
}

/** Fold one payment row into a coverage accumulator. */
export function addCoverage(
	existing: MonthCoverage | undefined,
	row: {
		paidAmount: number;
		discount: number;
		freeAccount: boolean;
		paidAt: Date;
	},
): MonthCoverage {
	return {
		covered: (existing?.covered ?? 0) + row.paidAmount + row.discount,
		free: (existing?.free ?? false) || row.freeAccount,
		postCutoff:
			(existing?.postCutoff ?? false) ||
			row.paidAt >= LEGACY_SETTLEMENT_CUTOFF,
	};
}

/**
 * A month whose coverage predates the cutoff keeps the settlement the old
 * system gave it — see LEGACY_SETTLEMENT_CUTOFF.
 */
function legacySettled(coverage: MonthCoverage): boolean {
	return coverage.covered > 0 && !coverage.postCutoff;
}

/** Is a month with this invoice amount fully covered? */
export function monthSettled(
	invoiceAmount: number,
	coverage: MonthCoverage | undefined,
): boolean {
	if (!coverage) {
		return false;
	}
	return (
		coverage.free ||
		legacySettled(coverage) ||
		coverage.covered >= invoiceAmount - AMOUNT_EPSILON
	);
}

/**
 * What is still owed on a month. Never negative — an overpaid month (the
 * allocator folds change into the newest row) owes nothing.
 */
export function monthRemaining(
	invoiceAmount: number,
	coverage: MonthCoverage | undefined,
): number {
	if (coverage && (coverage.free || legacySettled(coverage))) {
		return 0;
	}
	const remaining = invoiceAmount - (coverage?.covered ?? 0);
	return remaining > AMOUNT_EPSILON ? remaining : 0;
}

/** The collectible amount an invoice row froze. */
export function invoiceAmount(inv: {
	total: number;
	totalWithTax: number;
}): number {
	return inv.totalWithTax > 0 ? inv.totalWithTax : inv.total;
}

type CoverageClient = Pick<typeof db, "payment">;

/**
 * Load coverage for (customer × billing month) pairs in one query.
 * Pass `customerIds` to scope; omit it for org-wide aggregation.
 * Accepts a transaction client so createPayment can recompute under its
 * advisory lock.
 */
export async function fetchCoverageMap(
	client: CoverageClient,
	organizationId: string,
	billingMonthIds: string[],
	customerIds?: string[],
): Promise<Map<string, MonthCoverage>> {
	if (billingMonthIds.length === 0) {
		return new Map();
	}
	const rows = await client.payment.findMany({
		where: {
			organizationId,
			billingMonthId: { in: billingMonthIds },
			...(customerIds ? { customerId: { in: customerIds } } : {}),
			...COVERING_PAYMENT,
		},
		select: {
			customerId: true,
			billingMonthId: true,
			paidAmount: true,
			discount: true,
			freeAccount: true,
			paidAt: true,
		},
	});
	const map = new Map<string, MonthCoverage>();
	for (const row of rows) {
		const key = coverageKey(row.customerId, row.billingMonthId);
		map.set(key, addCoverage(map.get(key), row));
	}
	return map;
}

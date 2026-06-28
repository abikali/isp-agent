/**
 * CashCollection.amount sign convention.
 *
 * The legacy billing import (`billing-sync.worker.ts` phase 3) preserves
 * `john_collection.collect_amount` verbatim, and the legacy system encoded
 * direction in the SIGN of the amount:
 *
 *  - POSITIVE — cash leaving the collector/worker pocket toward the org:
 *    handoff deposits ("wasil"), approved expenses, dealer payments,
 *    admin transfers.
 *  - NEGATIVE — cash entering the collector/worker pocket from customers:
 *    installation charges, new-customer setup money.
 *
 * Collector balance everywhere is `Σ payments − Σ cashCollection.amount`
 * (see `fetchCollectorBalance` in billing/lib/queries.ts), so a negative
 * amount INCREASES the balance the employee owes.
 *
 * Every native write of a CashCollection row MUST go through these helpers
 * so new rows stay consistent with the imported ledger.
 */

/** Hardware/installation money a worker collected from a customer. */
export function installationCostAmount(total: number): number {
	return -Math.abs(total);
}

/** Items + add-on money collected during a worker-created customer setup. */
export function newUserSetupAmount(total: number): number {
	return -Math.abs(total);
}

/** Approved worker expense — offsets cash the worker must hand in. */
export function expenseDeductionAmount(total: number): number {
	return Math.abs(total);
}

/** Cash physically handed off to the office. */
export function handoffAmount(total: number): number {
	return Math.abs(total);
}

/**
 * Money handed TO a worker (advance/salary/reimbursement), funded by the
 * company. Stored POSITIVE for display only — these rows use the `SALARY`
 * type and are excluded from every balance/handed-off aggregation, so the
 * sign never affects a worker's cash in hand.
 */
export function moneyGivenAmount(total: number): number {
	return Math.abs(total);
}

/**
 * Worker buying a company item out of the cash he collected. Cash leaves his
 * pocket toward the org (he pays for the item), so it is POSITIVE — it lowers
 * his cash in hand and counts as company income. No offsetting expense.
 */
export function storePurchaseAmount(total: number): number {
	return Math.abs(total);
}

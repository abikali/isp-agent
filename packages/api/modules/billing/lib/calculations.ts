/**
 * Centralized billing calculation helpers.
 * All balance/amount formulas live here so they stay consistent.
 */

/** One unpaid invoice, carrying the billing month it settles. */
export interface UnpaidInvoiceRow {
	invoiceId: string;
	billingMonthId: string;
	year: number;
	month: number;
	/** Frozen invoice total (tax-inclusive when present). */
	amount: number;
}

/** One allocated settlement row: how much of a lump payment lands on an invoice. */
export interface PaymentAllocationRow {
	invoiceId: string;
	billingMonthId: string;
	amount: number;
}

/**
 * FIFO-allocate a lump `paidAmount` across owed invoices, oldest first: each
 * invoice absorbs up to its frozen amount, stopping once the money runs out.
 * Any overpayment beyond every owed month is folded into the last (newest)
 * row so the allocation always sums to exactly `paidAmount`. Returns [] only
 * when there are no unpaid invoices to settle. Callers pass `unpaid` already
 * sorted oldest-first (see `fetchCustomerUnpaidInvoices`).
 */
export function allocatePaymentAcrossInvoices(
	paidAmount: number,
	unpaid: UnpaidInvoiceRow[],
): PaymentAllocationRow[] {
	const rows: PaymentAllocationRow[] = [];
	let remaining = paidAmount;
	for (const inv of unpaid) {
		if (remaining <= 0.001 && rows.length > 0) {
			break;
		}
		const amount = Math.min(remaining, inv.amount);
		rows.push({
			invoiceId: inv.invoiceId,
			billingMonthId: inv.billingMonthId,
			amount,
		});
		remaining -= amount;
	}
	const last = rows[rows.length - 1];
	if (remaining > 0.001 && last) {
		last.amount += remaining;
	}
	return rows;
}

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

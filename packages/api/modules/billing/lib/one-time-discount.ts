import type { Prisma } from "@repo/database";
import { round2 } from "../../dealers/lib/ledger";

/**
 * "This month only" discount: lowers ONE invoice and nothing else.
 *
 * iRadius has no one-time discount (only the recurring `User.Discount`,
 * applied on every renew), and dealer charges ignore customer discounts, so
 * this is local-only by design. It never touches `customer.*` (that would
 * recur through the generator) and never writes `Payment.discount` (the
 * sheet already stamps the standing discount there — coverage would count
 * it twice). The collector sees the lower remainder because the payment
 * sheet reads the invoice.
 */

export class OneTimeDiscountError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OneTimeDiscountError";
	}
}

export interface DiscountableInvoice {
	total: number;
	discount: number;
	tax: number;
	note: string | null;
	voidedAt: Date | null;
}

/** The invoice fields after a one-time discount — pure, for the tests. */
export function oneTimeDiscountUpdate(
	invoice: DiscountableInvoice,
	params: { amount: number; reason: string; userName: string },
): { discount: number; total: number; totalWithTax: number; note: string } {
	if (invoice.voidedAt) {
		throw new OneTimeDiscountError("This invoice is voided.");
	}
	const amount = round2(params.amount);
	if (!(amount > 0)) {
		throw new OneTimeDiscountError("The discount must be more than $0.");
	}
	if (amount > invoice.total + 1e-6) {
		throw new OneTimeDiscountError(
			`The discount ($${amount}) is more than the invoice total ($${invoice.total}).`,
		);
	}
	const total = round2(invoice.total - amount);
	const line = `One-time discount −$${amount} (this month only): ${params.reason.trim() || "no reason given"} — ${params.userName}`;
	return {
		discount: round2(invoice.discount + amount),
		total,
		totalWithTax: round2(total + invoice.tax),
		note: invoice.note ? `${invoice.note} · ${line}` : line,
	};
}

type Tx = Pick<Prisma.TransactionClient, "customerInvoice">;

/** Apply a one-time discount to an invoice inside the caller's transaction. */
export async function applyOneTimeDiscount(
	tx: Tx,
	params: {
		invoiceId: string;
		amount: number;
		reason: string;
		userName: string;
	},
): Promise<{ oldTotal: number; total: number; totalWithTax: number }> {
	const invoice = await tx.customerInvoice.findUnique({
		where: { id: params.invoiceId },
		select: {
			total: true,
			discount: true,
			tax: true,
			note: true,
			voidedAt: true,
		},
	});
	if (!invoice) {
		throw new OneTimeDiscountError("Invoice not found.");
	}
	const data = oneTimeDiscountUpdate(invoice, params);
	await tx.customerInvoice.update({
		where: { id: params.invoiceId },
		data,
	});
	return {
		oldTotal: invoice.total,
		total: data.total,
		totalWithTax: data.totalWithTax,
	};
}

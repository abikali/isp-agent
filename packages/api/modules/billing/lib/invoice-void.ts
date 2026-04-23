/**
 * Invoice void / unvoid helpers.
 *
 * A voided invoice exists in history (audit trail) but does not count toward
 * "customer owes" or "customer due" in any billing view. The triple-field
 * write (voidedAt, voidedById, voidReason) is centralized here so callers
 * can't drift on the shape.
 */

import type { Prisma } from "@repo/database";

type Tx = Prisma.TransactionClient;

export const VOID_REASON = {
	STOPPED: "STOPPED",
	ADMIN: "ADMIN",
} as const;

export type VoidReason = (typeof VOID_REASON)[keyof typeof VOID_REASON];

export function voidInvoice(
	tx: Tx,
	invoiceId: string,
	voidedById: string,
	reason: VoidReason,
) {
	return tx.customerInvoice.update({
		where: { id: invoiceId },
		data: {
			voidedAt: new Date(),
			voidedById,
			voidReason: reason,
		},
	});
}

export function unvoidInvoice(tx: Tx, invoiceId: string) {
	return tx.customerInvoice.update({
		where: { id: invoiceId },
		data: {
			voidedAt: null,
			voidedById: null,
			voidReason: null,
		},
	});
}

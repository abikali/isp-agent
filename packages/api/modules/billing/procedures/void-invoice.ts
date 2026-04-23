import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { unvoidInvoice, VOID_REASON, voidInvoice } from "../lib/invoice-void";

/**
 * Admin void / unvoid for an invoice. Voided invoices stay in the table
 * for audit but are filtered out of every billing view via NOT_VOIDED.
 */

const input = z.object({
	organizationId: z.string(),
	invoiceId: z.string(),
});

async function loadOrgInvoice(
	organizationId: string,
	invoiceId: string,
	activeDealerId: string | null,
) {
	const invoice = await db.customerInvoice.findFirst({
		where: {
			id: invoiceId,
			organizationId,
			customer: getDealerScopeFilter(activeDealerId),
		},
		select: { id: true, voidedAt: true },
	});
	if (!invoice) {
		throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
	}
	return invoice;
}

export const voidInvoiceProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/{invoiceId}/void",
		tags: ["Billing"],
		summary: "Void an invoice",
	})
	.input(input)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		const existing = await loadOrgInvoice(
			input.organizationId,
			input.invoiceId,
			activeDealerId,
		);
		if (existing.voidedAt) {
			throw new ORPCError("CONFLICT", {
				message: "Invoice is already voided",
			});
		}
		const invoice = await voidInvoice(
			db,
			input.invoiceId,
			user.id,
			VOID_REASON.ADMIN,
		);
		return { invoice };
	});

export const unvoidInvoiceProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/{invoiceId}/unvoid",
		tags: ["Billing"],
		summary: "Unvoid an invoice",
	})
	.input(input)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		const existing = await loadOrgInvoice(
			input.organizationId,
			input.invoiceId,
			activeDealerId,
		);
		if (!existing.voidedAt) {
			throw new ORPCError("CONFLICT", {
				message: "Invoice is not voided",
			});
		}
		const invoice = await unvoidInvoice(db, input.invoiceId);
		return { invoice };
	});

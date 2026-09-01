import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Delete an invoice. Refuses if a Payment is linked — the admin must
 * delete the payment first (or the payment's invoiceId should be cleared
 * via onDelete: SetNull semantics, but we block to surface the intent).
 */
export const deleteInvoice = protectedProcedure
	.route({
		method: "DELETE",
		path: "/billing/invoices/{invoiceId}",
		tags: ["Billing"],
		summary: "Delete an invoice",
	})
	.input(
		z.object({
			organizationId: z.string(),
			invoiceId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const invoice = await db.customerInvoice.findFirst({
			where: {
				id: input.invoiceId,
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				payments: { select: { id: true }, take: 1 },
			},
		});
		if (!invoice) {
			throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
		}
		if (invoice.payments.length > 0) {
			throw new ORPCError("CONFLICT", {
				message:
					"Cannot delete an invoice with a linked payment. Delete the payment first.",
			});
		}

		await db.customerInvoice.delete({
			where: { id: input.invoiceId },
		});

		return { success: true };
	});

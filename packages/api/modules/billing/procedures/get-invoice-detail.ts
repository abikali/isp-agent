import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Fetch one invoice by id with customer + payment info.
 * Separate from the public `getInvoice` (which is a payment receipt view).
 */
export const getInvoiceDetail = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/invoices/{invoiceId}",
		tags: ["Billing"],
		summary: "Get invoice detail for admin view/edit",
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
			"view",
		);

		const invoice = await db.customerInvoice.findFirst({
			where: {
				id: input.invoiceId,
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				year: true,
				month: true,
				invoiceDate: true,
				expiryDate: true,
				accountPrice: true,
				iptvPrice: true,
				realIpPrice: true,
				total: true,
				discount: true,
				tax: true,
				totalWithTax: true,
				note: true,
				paid: true,
				voidedAt: true,
				voidReason: true,
				createdAt: true,
				customer: {
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						username: true,
						mobile: true,
						phone: true,
						groupName: true,
						monthlyRate: true,
						plan: {
							select: {
								id: true,
								name: true,
								monthlyPrice: true,
							},
						},
					},
				},
				payment: {
					select: {
						id: true,
						paidAmount: true,
						paidAt: true,
						collector: { select: { id: true, name: true } },
					},
				},
			},
		});

		if (!invoice) {
			throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
		}

		return { invoice };
	});

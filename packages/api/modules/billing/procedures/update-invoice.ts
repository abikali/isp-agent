import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Update invoice amounts / due date. Amount adjustments after generation
 * are a normal part of billing (discount negotiated, correction, add-on).
 */
export const updateInvoice = protectedProcedure
	.route({
		method: "PATCH",
		path: "/billing/invoices/{invoiceId}",
		tags: ["Billing"],
		summary: "Update an invoice",
	})
	.input(
		z.object({
			organizationId: z.string(),
			invoiceId: z.string(),
			accountPrice: z.number().finite().min(0).nullable().optional(),
			iptvPrice: z.number().finite().min(0).nullable().optional(),
			realIpPrice: z.number().finite().min(0).nullable().optional(),
			total: z.number().finite().min(0).optional(),
			discount: z.number().finite().min(0).optional(),
			tax: z.number().finite().min(0).optional(),
			totalWithTax: z.number().finite().min(0).optional(),
			expiryDate: z.string().optional(),
			note: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const existing = await db.customerInvoice.findFirst({
			where: {
				id: input.invoiceId,
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
		}

		const data: Record<string, unknown> = {};
		if (input.accountPrice !== undefined) {
			data["accountPrice"] = input.accountPrice;
		}
		if (input.iptvPrice !== undefined) {
			data["iptvPrice"] = input.iptvPrice;
		}
		if (input.realIpPrice !== undefined) {
			data["realIpPrice"] = input.realIpPrice;
		}
		if (input.total !== undefined) {
			data["total"] = input.total;
		}
		if (input.discount !== undefined) {
			data["discount"] = input.discount;
		}
		if (input.tax !== undefined) {
			data["tax"] = input.tax;
		}
		if (input.totalWithTax !== undefined) {
			data["totalWithTax"] = input.totalWithTax;
		}
		if (input.expiryDate !== undefined) {
			data["expiryDate"] = new Date(input.expiryDate);
		}
		if (input.note !== undefined) {
			data["note"] = input.note;
		}

		const invoice = await db.customerInvoice.update({
			where: { id: input.invoiceId },
			data,
		});

		return { invoice };
	});

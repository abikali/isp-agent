import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Update a payment's mutable fields. Leaves invoice / customer / billing
 * month linkage untouched — those are identity and shouldn't be edited.
 */
export const updatePayment = protectedProcedure
	.route({
		method: "PATCH",
		path: "/billing/payments/{paymentId}",
		tags: ["Billing"],
		summary: "Update a payment's amounts and metadata",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			accountPrice: z.number().finite().min(0).optional(),
			paidAmount: z.number().finite().min(0).optional(),
			discount: z.number().finite().min(0).optional(),
			noteCategory: z.string().nullable().optional(),
			notes: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const existing = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
		}

		const data: Record<string, unknown> = {};
		if (input.accountPrice !== undefined) {
			data["accountPrice"] = input.accountPrice;
		}
		if (input.paidAmount !== undefined) {
			data["paidAmount"] = input.paidAmount;
		}
		if (input.discount !== undefined) {
			data["discount"] = input.discount;
		}
		// Normalize blank/whitespace to null so an empty edit never trips the
		// `notes IS NOT NULL` needs-review predicate (see review-status.ts).
		if (input.noteCategory !== undefined) {
			data["noteCategory"] = input.noteCategory?.trim() || null;
		}
		if (input.notes !== undefined) {
			data["notes"] = input.notes?.trim() || null;
		}

		const payment = await db.payment.update({
			where: { id: input.paymentId },
			data,
		});

		return { payment };
	});

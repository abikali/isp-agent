import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deletePayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/delete",
		tags: ["Billing"],
		summary: "Delete a payment and reset customer paid status",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
			},
			select: { id: true, customerId: true },
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		await db.$transaction(async (tx) => {
			await tx.payment.delete({
				where: { id: input.paymentId },
			});

			// Check if customer has any other payments in current cycle
			const otherPayments = await tx.payment.count({
				where: {
					customerId: payment.customerId,
					organizationId: input.organizationId,
					stoppedAccount: false,
				},
			});

			if (otherPayments === 0) {
				await tx.customer.update({
					where: { id: payment.customerId },
					data: { paidCurrentCycle: false },
				});
			}
		});

		return { success: true };
	});

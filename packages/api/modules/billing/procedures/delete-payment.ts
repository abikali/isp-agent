import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import { logger } from "@repo/logs";
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
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				customerId: true,
				billingCycleId: true,
				collectorId: true,
				paidAmount: true,
			},
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

			// Check if customer has any other processed payments in the same billing cycle
			const otherPayments = await tx.payment.count({
				where: {
					customerId: payment.customerId,
					organizationId: input.organizationId,
					billingCycleId: payment.billingCycleId,
					stoppedAccount: false,
					status: {
						in: [
							PaymentStatus.PENDING,
							PaymentStatus.PARTIAL,
							PaymentStatus.PROCESSED,
						],
					},
				},
			});

			if (otherPayments === 0) {
				await tx.customer.update({
					where: { id: payment.customerId },
					data: { paidCurrentCycle: false },
				});
			}
		});

		// Warn if collector has handoff records — deleting a payment can cause
		// balance discrepancies (handoff amount may now exceed pending total)
		const handoffCount = await db.cashCollection.count({
			where: {
				organizationId: input.organizationId,
				collectorId: payment.collectorId,
			},
		});
		if (handoffCount > 0) {
			logger.warn(
				"[Billing] Payment deleted for collector with existing handoff records — balance may need review",
				{
					paymentId: input.paymentId,
					collectorId: payment.collectorId,
					paidAmount: payment.paidAmount,
					handoffCount,
				},
			);
		}

		return { success: true };
	});

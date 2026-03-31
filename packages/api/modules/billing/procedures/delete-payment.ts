import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deletePayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/delete",
		tags: ["Billing"],
		summary: "Delete a payment",
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
				collectorId: true,
				paidAmount: true,
				stoppedAccount: true,
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		await db.payment.delete({
			where: { id: input.paymentId },
		});

		// If the payment had marked the customer as stopped (INACTIVE),
		// restore the customer back to ACTIVE so they reappear in the unpaid list
		if (payment.stoppedAccount) {
			await db.customer.update({
				where: { id: payment.customerId },
				data: { status: "ACTIVE" },
			});
		}

		// Warn if collector has handoff records — deleting a payment can cause
		// balance discrepancies (handoff amount may now exceed collected total)
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

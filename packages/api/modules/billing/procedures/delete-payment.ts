import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";

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
				customer: {
					select: { externalId: true, username: true },
				},
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		// If the payment had marked the customer as stopped (INACTIVE),
		// reactivate in iRadius FIRST — if that fails, do not delete the
		// payment locally either, otherwise we'd drift in two directions.
		if (payment.stoppedAccount) {
			await mirrorToIRadius({
				logTag: "iRadius reactivate on payment delete",
				failureMessage: "Failed to reactivate customer in iRadius",
				remote: () => iradiusSetActive(payment.customer, true),
				local: async () => {
					await db.payment.delete({
						where: { id: input.paymentId },
					});
					await db.customer.update({
						where: { id: payment.customerId },
						data: { status: "ACTIVE" },
					});
				},
			});
		} else {
			await db.payment.delete({
				where: { id: input.paymentId },
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

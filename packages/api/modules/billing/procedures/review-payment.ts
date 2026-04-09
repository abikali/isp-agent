import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";

export const reviewPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/review",
		tags: ["Billing"],
		summary: "Mark a flagged payment as reviewed",
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
				reviewedAt: true,
				stoppedAccount: true,
				customerId: true,
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

		// Deactivate in iRadius FIRST when approving a stopped payment.
		// If that fails the local review + status change never run.
		const runLocal = () =>
			db.$transaction(async (tx) => {
				await tx.payment.update({
					where: { id: input.paymentId },
					data: { reviewedAt: new Date() },
				});
				if (payment.stoppedAccount) {
					await tx.customer.update({
						where: { id: payment.customerId },
						data: { status: "INACTIVE" },
					});
				}
			});

		if (payment.stoppedAccount) {
			await mirrorToIRadius({
				logTag: "iRadius deactivate on review-payment",
				failureMessage: "Failed to deactivate customer in iRadius",
				remote: () => iradiusSetActive(payment.customer, false),
				local: runLocal,
			});
		} else {
			await runLocal();
		}

		return { success: true };
	});

import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { reviewOnePayment } from "../lib/review-payment-core";

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
			// Set after the operator confirms (via the client prompt) that the
			// iRadius user is already gone: forgives the "user not found"
			// remote error and still records the local deactivation.
			force: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
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
				freeAccount: true,
				referredCustomerId: true,
				referralRewardNotifiedAt: true,
				customerId: true,
				invoiceId: true,
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

		// Already reviewed (double click, stale tab): re-running would re-stamp
		// reviewedAt and, for a stopped account, deactivate in iRadius again.
		if (payment.reviewedAt) {
			return {
				success: true,
				alreadyReviewed: true,
				referralRewardQueued: false,
			};
		}

		const { referralRewardQueued } = await reviewOnePayment({
			organizationId: input.organizationId,
			userId: user.id,
			payment,
			iradiusDisabled,
			// `force` is set once the operator confirms via the client prompt
			// that the iRadius user is already gone.
			tolerateMissing: input.force === true,
		});

		notifyBadgeForOrganization(input.organizationId);

		return { success: true, alreadyReviewed: false, referralRewardQueued };
	});

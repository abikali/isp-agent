import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queueWhatsAppReferralReward } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { referralRewardResendBlock } from "../lib/referral-reward";
import { isReferralRewardMessagingEnabled } from "../lib/review-payment-core";

/**
 * Manually (re)send the referrer's "free month" WhatsApp for an approved
 * referral free month — after a failed send, or for a payment approved while
 * the messaging switch was off. The worker re-checks the payment and logs
 * the result to its activity log like the automatic send.
 */
export const resendReferralReward = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/resend-referral-reward",
		tags: ["Billing"],
		summary: "Send the referrer's free-month WhatsApp for a payment",
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

		if (!isReferralRewardMessagingEnabled()) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Referral free-month WhatsApps are switched off until the template is approved",
			});
		}

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				freeAccount: true,
				stoppedAccount: true,
				referredCustomerId: true,
				reviewedAt: true,
				activityLog: true,
			},
		});
		if (!payment) {
			throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
		}

		const block = referralRewardResendBlock(payment, new Date());
		if (block === "not_referral") {
			throw new ORPCError("BAD_REQUEST", {
				message: "This payment is not a referral free month",
			});
		}
		if (block === "not_reviewed") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Approve the payment before messaging the referrer",
			});
		}
		if (block === "rate_limited") {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message:
					"Please wait at least 60 seconds before sending it again",
			});
		}

		// The worker only sends for a claimed payment; claim it if approval
		// didn't (messaging was off then).
		await db.payment.updateMany({
			where: { id: payment.id, referralRewardNotifiedAt: null },
			data: { referralRewardNotifiedAt: new Date() },
		});
		await queueWhatsAppReferralReward(payment.id);

		return { success: true };
	});

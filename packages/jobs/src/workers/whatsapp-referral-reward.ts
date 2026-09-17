import { appendPaymentActivityLog, db, getPrimaryPhone } from "@repo/database";
import { logger } from "@repo/logs";
import type { Job } from "bullmq";
import { sendWhatsAppReferralReward } from "../lib/wpbox";
import { WHATSAPP_RECEIPT_MAX_ATTEMPTS } from "../queues/whatsapp-receipt.queue";
import type { ReferralRewardJobData, WhatsAppReceiptJobResult } from "../types";

const ACTION = "whatsapp_referral_reward";

/**
 * Send the referrer's "free month" WhatsApp. Runs on the receipt worker.
 *
 * Re-reads the payment instead of trusting the enqueue-time state: a payment
 * deleted, or edited out of being a referral free month, since approval gets
 * no message. The result lands in the payment's activity log either way.
 */
export async function processReferralRewardJob(
	data: ReferralRewardJobData,
	job: Pick<Job, "attemptsMade" | "opts">,
): Promise<WhatsAppReceiptJobResult> {
	const { paymentId } = data;
	const payment = await db.payment.findUnique({
		where: { id: paymentId },
		select: {
			freeAccount: true,
			stoppedAccount: true,
			reviewedAt: true,
			referralRewardNotifiedAt: true,
			billingMonth: { select: { year: true, month: true } },
			customer: {
				select: {
					firstName: true,
					lastName: true,
					username: true,
					phones: true,
					mobile: true,
					phone: true,
				},
			},
			referredCustomer: {
				select: { firstName: true, lastName: true, username: true },
			},
		},
	});

	if (
		!payment?.freeAccount ||
		payment.stoppedAccount ||
		!payment.referredCustomer ||
		!payment.reviewedAt ||
		!payment.referralRewardNotifiedAt
	) {
		return { success: false };
	}

	const { customer, referredCustomer } = payment;
	const phone =
		getPrimaryPhone(customer.phones) ??
		(customer.mobile?.trim() || null) ??
		(customer.phone?.trim() || null);
	if (!phone) {
		await appendPaymentActivityLog([paymentId], {
			action: ACTION,
			status: "skipped",
			error: "Customer has no phone number",
			timestamp: new Date().toISOString(),
		});
		return { success: false };
	}

	const result = await sendWhatsAppReferralReward({
		phone,
		paymentId,
		referrerName: customer.firstName ?? customer.username,
		referredName:
			[referredCustomer.firstName, referredCustomer.lastName]
				.filter(Boolean)
				.join(" ") || referredCustomer.username,
		year: payment.billingMonth.year,
		month: payment.billingMonth.month,
	});

	if (result.ok) {
		// Sent: a failed log write must not fail the job and trigger a
		// retry that messages the referrer again.
		try {
			await appendPaymentActivityLog([paymentId], {
				action: ACTION,
				status: "success",
				statusCode: result.status,
				detail: result.phone,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			logger.error("[WhatsApp Referral Reward] Sent but failed to log", {
				paymentId,
				error: String(error),
			});
		}
		return { success: true };
	}

	// Same retry bookkeeping as receipts: transient failures throw to retry
	// and only the final attempt is logged; permanent ones log and stop.
	if (result.retriable) {
		const maxAttempts = job.opts.attempts ?? WHATSAPP_RECEIPT_MAX_ATTEMPTS;
		if (job.attemptsMade + 1 >= maxAttempts) {
			await appendPaymentActivityLog([paymentId], {
				action: ACTION,
				status: "failed",
				statusCode: result.status,
				error: `${result.error} after ${maxAttempts} attempts`,
				detail: result.phone,
				timestamp: new Date().toISOString(),
			});
		}
		throw new Error(`WPBox retry: ${result.error} for ${result.phone}`);
	}

	await appendPaymentActivityLog([paymentId], {
		action: ACTION,
		status: result.status === undefined ? "skipped" : "failed",
		statusCode: result.status,
		error: result.error,
		detail: result.phone,
		timestamp: new Date().toISOString(),
	});
	return { success: false };
}

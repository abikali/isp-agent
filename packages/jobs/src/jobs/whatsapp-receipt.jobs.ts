import { getWhatsAppReceiptQueue } from "../queues/whatsapp-receipt.queue";
import type { WhatsAppReceiptJobData } from "../types";

/**
 * Queue a receipt send. Deduplicated per payment: while a receipt job for the
 * same payment is still waiting, delayed or retrying, another add is a no-op —
 * so a double-clicked resend, or a bulk resend overlapping the auto send,
 * can't message the customer twice.
 */
export async function queueWhatsAppReceipt(
	data: WhatsAppReceiptJobData,
	options: { delay?: number | undefined } = {},
): Promise<string> {
	const queue = getWhatsAppReceiptQueue();
	const job = await queue.add("send-receipt", data, {
		deduplication: { id: `receipt:${data.paymentId}` },
		...(options.delay ? { delay: options.delay } : {}),
	});
	return job.id ?? "";
}

/**
 * Queue the referrer's "free month" WhatsApp for an approved referral free
 * payment. The caller claims `Payment.referralRewardNotifiedAt` first; the
 * dedupe id is a second guard against a double enqueue.
 */
export async function queueWhatsAppReferralReward(
	paymentId: string,
): Promise<string> {
	const queue = getWhatsAppReceiptQueue();
	const job = await queue.add(
		"send-referral-reward",
		{ kind: "referral-reward", paymentId },
		{ deduplication: { id: `referral-reward:${paymentId}` } },
	);
	return job.id ?? "";
}

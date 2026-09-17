import { appendPaymentActivityLog } from "@repo/database";
import { logger } from "@repo/logs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { getWorkerConcurrency } from "../lib/worker-concurrency";
import { sendWhatsAppReceipt } from "../lib/wpbox";
import {
	WHATSAPP_RECEIPT_MAX_ATTEMPTS,
	WHATSAPP_RECEIPT_QUEUE_NAME,
} from "../queues/whatsapp-receipt.queue";
import type {
	WhatsAppReceiptJobResult,
	WhatsAppReceiptQueueJobData,
} from "../types";
import { processReferralRewardJob } from "./whatsapp-referral-reward";

export function createWhatsAppReceiptWorker(): Worker<
	WhatsAppReceiptQueueJobData,
	WhatsAppReceiptJobResult
> {
	return new Worker<WhatsAppReceiptQueueJobData, WhatsAppReceiptJobResult>(
		WHATSAPP_RECEIPT_QUEUE_NAME,
		async (job) => {
			if ("kind" in job.data) {
				return processReferralRewardJob(job.data, job);
			}
			const { phone: rawPhone, paymentId, source = "auto" } = job.data;
			const actionLabel =
				source === "manual"
					? "whatsapp_receipt_manual"
					: "whatsapp_receipt";

			const result = await sendWhatsAppReceipt({
				phone: rawPhone,
				paymentId,
			});

			if (!result.ok) {
				// Permanent failure (4xx, missing token, bad phone) — log and
				// give up. Transient failure (5xx, 404, timeout) — throw to
				// retry, but only write a "failed" activity row on the final
				// attempt so the log isn't flooded with retry noise.
				if (result.retriable) {
					const maxAttempts =
						job.opts.attempts ?? WHATSAPP_RECEIPT_MAX_ATTEMPTS;
					if (job.attemptsMade + 1 >= maxAttempts) {
						await appendPaymentActivityLog([paymentId], {
							action: actionLabel,
							status: "failed",
							statusCode: result.status,
							error: `${result.error} after ${maxAttempts} attempts`,
							detail: result.phone,
							timestamp: new Date().toISOString(),
						});
					}
					throw new Error(
						`WPBox retry: ${result.error} for ${result.phone}`,
					);
				}

				await appendPaymentActivityLog([paymentId], {
					action: actionLabel,
					status: result.status === undefined ? "skipped" : "failed",
					statusCode: result.status,
					error: result.error,
					detail: result.phone,
					timestamp: new Date().toISOString(),
				});
				return { success: false };
			}

			logger.info("[WhatsApp Receipt] Sent successfully", {
				phone: result.phone,
				paymentId,
			});

			await appendPaymentActivityLog(
				[paymentId],
				{
					action: actionLabel,
					status: "success",
					statusCode: result.status,
					detail: result.phone,
					timestamp: new Date().toISOString(),
				},
				{ markReceiptSent: true },
			);

			return { success: true };
		},
		{
			connection: getRedisConnection(),
			concurrency: getWorkerConcurrency(
				"WHATSAPP_RECEIPT_WORKER_CONCURRENCY",
				5,
			),
		},
	);
}

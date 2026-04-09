import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { getWorkerConcurrency } from "../lib/worker-concurrency";
import { sendWhatsAppReceipt } from "../lib/wpbox";
import { WHATSAPP_RECEIPT_QUEUE_NAME } from "../queues/whatsapp-receipt.queue";
import type {
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult,
} from "../types";

interface ActivityLogEntry {
	action: string;
	status: "success" | "failed" | "skipped";
	statusCode?: number;
	error?: string;
	detail?: string;
	timestamp: string;
}

async function appendActivityLog(
	paymentId: string,
	entry: ActivityLogEntry,
): Promise<void> {
	const payment = await db.payment.findUnique({
		where: { id: paymentId },
		select: { activityLog: true },
	});
	const log = Array.isArray(payment?.activityLog)
		? (payment.activityLog as Prisma.JsonArray)
		: [];
	log.push(entry as unknown as Prisma.JsonValue);
	await db.payment.update({
		where: { id: paymentId },
		data: { activityLog: log },
	});
}

export function createWhatsAppReceiptWorker(): Worker<
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult
> {
	return new Worker<WhatsAppReceiptJobData, WhatsAppReceiptJobResult>(
		WHATSAPP_RECEIPT_QUEUE_NAME,
		async (job) => {
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
				// give up. Transient failure (5xx, timeout) — throw to retry,
				// but only write a "failed" activity row on the final attempt
				// so the log isn't flooded with retry noise.
				if (result.retriable) {
					const maxAttempts = job.opts.attempts ?? 3;
					if (job.attemptsMade + 1 >= maxAttempts) {
						await appendActivityLog(paymentId, {
							action: actionLabel,
							status: "failed",
							...(result.status !== undefined && {
								statusCode: result.status,
							}),
							error: `${result.error} after ${maxAttempts} attempts`,
							detail: result.phone,
							timestamp: new Date().toISOString(),
						});
					}
					throw new Error(
						`WPBox retry: ${result.error} for ${result.phone}`,
					);
				}

				await appendActivityLog(paymentId, {
					action: actionLabel,
					status: result.status === undefined ? "skipped" : "failed",
					...(result.status !== undefined && {
						statusCode: result.status,
					}),
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

			// Update receipt status and append activity log in one write
			const payment = await db.payment.findUnique({
				where: { id: paymentId },
				select: { activityLog: true },
			});
			const log = Array.isArray(payment?.activityLog)
				? (payment.activityLog as Prisma.JsonArray)
				: [];
			log.push({
				action: actionLabel,
				status: "success",
				statusCode: result.status,
				detail: result.phone,
				timestamp: new Date().toISOString(),
			} as unknown as Prisma.JsonValue);

			await db.payment.update({
				where: { id: paymentId },
				data: {
					receiptSent: true,
					receiptSentAt: new Date(),
					activityLog: log,
				},
			});

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

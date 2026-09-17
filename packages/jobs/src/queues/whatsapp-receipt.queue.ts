import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { WhatsAppReceiptJobData } from "../types";

export const WHATSAPP_RECEIPT_QUEUE_NAME = "whatsapp-receipt";

/**
 * Retry budget for a receipt send. WPBox outages last hours (2026-09-04:
 * 08:42–13:02 UTC of 503s then 404s), and the old 3 attempts from 2s gave up
 * within seconds. 8 attempts with exponential backoff from 30s spread the
 * retries over ~64 minutes (30s, 1m, 2m, 4m, 8m, 16m, 32m); anything still
 * failing lands in the Receipt Failed filter for a bulk resend.
 */
export const WHATSAPP_RECEIPT_MAX_ATTEMPTS = 8;

let queue: Queue<WhatsAppReceiptJobData> | null = null;

export function getWhatsAppReceiptQueue(): Queue<WhatsAppReceiptJobData> {
	if (!queue) {
		queue = new Queue<WhatsAppReceiptJobData>(WHATSAPP_RECEIPT_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: WHATSAPP_RECEIPT_MAX_ATTEMPTS,
				backoff: {
					type: "exponential",
					delay: 30_000,
				},
				removeOnComplete: {
					age: 24 * 60 * 60,
					count: 1000,
				},
				removeOnFail: {
					age: 7 * 24 * 60 * 60,
				},
			},
		});
	}
	return queue;
}

export async function closeWhatsAppReceiptQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}

import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { WhatsAppReceiptJobData } from "../types";

export const WHATSAPP_RECEIPT_QUEUE_NAME = "whatsapp-receipt";

let queue: Queue<WhatsAppReceiptJobData> | null = null;

export function getWhatsAppReceiptQueue(): Queue<WhatsAppReceiptJobData> {
	if (!queue) {
		queue = new Queue<WhatsAppReceiptJobData>(WHATSAPP_RECEIPT_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 2000,
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

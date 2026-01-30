import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { WebhookJobData } from "../types";

export const WEBHOOK_QUEUE_NAME = "webhook";

let webhookQueue: Queue<WebhookJobData> | null = null;

export function getWebhookQueue(): Queue<WebhookJobData> {
	if (!webhookQueue) {
		webhookQueue = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 5,
				backoff: {
					type: "exponential",
					delay: 1000, // 1s, 2s, 4s, 8s, 16s
				},
				removeOnComplete: {
					age: 24 * 60 * 60, // 24 hours
					count: 1000,
				},
				removeOnFail: {
					age: 30 * 24 * 60 * 60, // 30 days for audit
				},
			},
		});
	}
	return webhookQueue;
}

export async function closeWebhookQueue(): Promise<void> {
	if (webhookQueue) {
		await webhookQueue.close();
		webhookQueue = null;
	}
}

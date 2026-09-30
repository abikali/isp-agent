import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { CustomerNotifyJobData } from "../types";

export const CUSTOMER_NOTIFY_QUEUE_NAME = "customer-notify";

/** 4 attempts, exponential from 60s: retries span ~7 minutes (1m, 2m, 4m). */
export const CUSTOMER_NOTIFY_MAX_ATTEMPTS = 4;

let queue: Queue<CustomerNotifyJobData> | null = null;

export function getCustomerNotifyQueue(): Queue<CustomerNotifyJobData> {
	if (!queue) {
		queue = new Queue<CustomerNotifyJobData>(CUSTOMER_NOTIFY_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: CUSTOMER_NOTIFY_MAX_ATTEMPTS,
				backoff: { type: "exponential", delay: 60_000 },
				removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
				removeOnFail: { age: 7 * 24 * 60 * 60 },
			},
		});
	}
	return queue;
}

export async function closeCustomerNotifyQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}

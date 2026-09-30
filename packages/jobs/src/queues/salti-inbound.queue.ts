import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { SaltiInboundJobData } from "../types";

export const SALTI_INBOUND_QUEUE_NAME = "salti-inbound";

let queue: Queue<SaltiInboundJobData> | null = null;

/**
 * Answers to official-number follow-ups. WPBox posts once and never retries,
 * so the webhook only enqueues and returns 200; retries happen here.
 */
export function getSaltiInboundQueue(): Queue<SaltiInboundJobData> {
	if (!queue) {
		queue = new Queue<SaltiInboundJobData>(SALTI_INBOUND_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 5,
				backoff: { type: "exponential", delay: 10_000 },
				removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
				removeOnFail: { age: 7 * 24 * 60 * 60 },
			},
		});
	}
	return queue;
}

export async function closeSaltiInboundQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}

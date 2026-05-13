import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { MarketingSendJobData } from "../types";

export const MARKETING_SEND_QUEUE_NAME = "marketing-send";

let queue: Queue<MarketingSendJobData> | null = null;

export function getMarketingSendQueue(): Queue<MarketingSendJobData> {
	if (!queue) {
		queue = new Queue<MarketingSendJobData>(MARKETING_SEND_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 2,
				backoff: { type: "exponential", delay: 5000 },
				removeOnComplete: { age: 24 * 60 * 60, count: 200 },
				removeOnFail: { age: 7 * 24 * 60 * 60 },
			},
		});
	}
	return queue;
}

export async function closeMarketingSendQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}

import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { TelegramNotifyJobData } from "../types";

export const TELEGRAM_NOTIFY_QUEUE_NAME = "telegram-notify";

let queue: Queue<TelegramNotifyJobData> | null = null;

export function getTelegramNotifyQueue(): Queue<TelegramNotifyJobData> {
	if (!queue) {
		queue = new Queue<TelegramNotifyJobData>(TELEGRAM_NOTIFY_QUEUE_NAME, {
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

export async function closeTelegramNotifyQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}

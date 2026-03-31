import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { TelegramLocationJobData } from "../types";

export const TELEGRAM_LOCATION_QUEUE_NAME = "telegram-location";

let queue: Queue<TelegramLocationJobData> | null = null;

export function getTelegramLocationQueue(): Queue<TelegramLocationJobData> {
	if (!queue) {
		queue = new Queue<TelegramLocationJobData>(
			TELEGRAM_LOCATION_QUEUE_NAME,
			{
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
			},
		);
	}
	return queue;
}

export async function closeTelegramLocationQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}

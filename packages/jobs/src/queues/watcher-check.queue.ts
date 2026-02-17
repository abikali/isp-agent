import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { WatcherCheckJobData } from "../types";

export const WATCHER_CHECK_QUEUE_NAME = "watcher-check";

let watcherCheckQueue: Queue<WatcherCheckJobData> | null = null;

export function getWatcherCheckQueue(): Queue<WatcherCheckJobData> {
	if (!watcherCheckQueue) {
		watcherCheckQueue = new Queue<WatcherCheckJobData>(
			WATCHER_CHECK_QUEUE_NAME,
			{
				connection: getRedisConnection(),
				defaultJobOptions: {
					attempts: 2,
					backoff: {
						type: "exponential",
						delay: 2000,
					},
					removeOnComplete: {
						age: 24 * 60 * 60, // 1 day
						count: 500,
					},
					removeOnFail: {
						age: 7 * 24 * 60 * 60, // 7 days
					},
				},
			},
		);
	}
	return watcherCheckQueue;
}

export async function closeWatcherCheckQueue(): Promise<void> {
	if (watcherCheckQueue) {
		await watcherCheckQueue.close();
		watcherCheckQueue = null;
	}
}

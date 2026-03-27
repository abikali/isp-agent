import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { IRadiusSyncJobData } from "../types";

export const IRADIUS_SYNC_QUEUE_NAME = "iradius-sync";

let iRadiusSyncQueue: Queue<IRadiusSyncJobData> | null = null;

export function getIRadiusSyncQueue(): Queue<IRadiusSyncJobData> {
	if (!iRadiusSyncQueue) {
		iRadiusSyncQueue = new Queue<IRadiusSyncJobData>(
			IRADIUS_SYNC_QUEUE_NAME,
			{
				connection: getRedisConnection(),
				defaultJobOptions: {
					attempts: 1, // No auto-retry — user can re-trigger
					removeOnComplete: {
						age: 30 * 24 * 60 * 60, // 30 days
						count: 100,
					},
					removeOnFail: {
						age: 30 * 24 * 60 * 60,
					},
				},
			},
		);
	}
	return iRadiusSyncQueue;
}

export async function closeIRadiusSyncQueue(): Promise<void> {
	if (iRadiusSyncQueue) {
		await iRadiusSyncQueue.close();
		iRadiusSyncQueue = null;
	}
}

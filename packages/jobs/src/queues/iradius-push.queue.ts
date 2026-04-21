import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { IRadiusPushJobData } from "../types";

export const IRADIUS_PUSH_QUEUE_NAME = "iradius-push";

let iRadiusPushQueue: Queue<IRadiusPushJobData> | null = null;

export function getIRadiusPushQueue(): Queue<IRadiusPushJobData> {
	if (!iRadiusPushQueue) {
		iRadiusPushQueue = new Queue<IRadiusPushJobData>(
			IRADIUS_PUSH_QUEUE_NAME,
			{
				connection: getRedisConnection(),
				defaultJobOptions: {
					attempts: 1,
					removeOnComplete: {
						age: 30 * 24 * 60 * 60,
						count: 100,
					},
					removeOnFail: {
						age: 30 * 24 * 60 * 60,
					},
				},
			},
		);
	}
	return iRadiusPushQueue;
}

export async function closeIRadiusPushQueue(): Promise<void> {
	if (iRadiusPushQueue) {
		await iRadiusPushQueue.close();
		iRadiusPushQueue = null;
	}
}

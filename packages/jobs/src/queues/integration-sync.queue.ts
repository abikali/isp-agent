import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { IntegrationSyncJobData } from "../types";

export const INTEGRATION_SYNC_QUEUE_NAME = "integration-sync";

let integrationSyncQueue: Queue<IntegrationSyncJobData> | null = null;

export function getIntegrationSyncQueue(): Queue<IntegrationSyncJobData> {
	if (!integrationSyncQueue) {
		integrationSyncQueue = new Queue<IntegrationSyncJobData>(
			INTEGRATION_SYNC_QUEUE_NAME,
			{
				connection: getRedisConnection(),
				defaultJobOptions: {
					attempts: 3,
					backoff: {
						type: "exponential",
						delay: 5000, // 5s, 10s, 20s
					},
					removeOnComplete: {
						age: 7 * 24 * 60 * 60, // 7 days
						count: 500,
					},
					removeOnFail: {
						age: 30 * 24 * 60 * 60, // 30 days for audit
					},
				},
			},
		);
	}
	return integrationSyncQueue;
}

export async function closeIntegrationSyncQueue(): Promise<void> {
	if (integrationSyncQueue) {
		await integrationSyncQueue.close();
		integrationSyncQueue = null;
	}
}

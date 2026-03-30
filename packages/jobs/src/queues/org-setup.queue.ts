import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { OrgSetupJobData } from "../types";

export const ORG_SETUP_QUEUE_NAME = "org-setup";

let orgSetupQueue: Queue<OrgSetupJobData> | null = null;

export function getOrgSetupQueue(): Queue<OrgSetupJobData> {
	if (!orgSetupQueue) {
		orgSetupQueue = new Queue<OrgSetupJobData>(ORG_SETUP_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 1000,
				},
				removeOnComplete: {
					age: 24 * 60 * 60,
					count: 100,
				},
				removeOnFail: {
					age: 7 * 24 * 60 * 60,
				},
			},
		});
	}
	return orgSetupQueue;
}

export async function closeOrgSetupQueue(): Promise<void> {
	if (orgSetupQueue) {
		await orgSetupQueue.close();
		orgSetupQueue = null;
	}
}

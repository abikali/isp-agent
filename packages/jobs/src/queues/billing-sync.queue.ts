import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { BillingSyncJobData } from "../types";

export const BILLING_SYNC_QUEUE_NAME = "billing-sync";

let billingSyncQueue: Queue<BillingSyncJobData> | null = null;

export function getBillingSyncQueue(): Queue<BillingSyncJobData> {
	if (!billingSyncQueue) {
		billingSyncQueue = new Queue<BillingSyncJobData>(
			BILLING_SYNC_QUEUE_NAME,
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
	return billingSyncQueue;
}

export async function closeBillingSyncQueue(): Promise<void> {
	if (billingSyncQueue) {
		await billingSyncQueue.close();
		billingSyncQueue = null;
	}
}

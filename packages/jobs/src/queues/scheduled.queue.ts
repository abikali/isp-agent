import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { ScheduledJobData } from "../types";

export const SCHEDULED_QUEUE_NAME = "scheduled";

let scheduledQueue: Queue<ScheduledJobData> | null = null;

export function getScheduledQueue(): Queue<ScheduledJobData> {
	if (!scheduledQueue) {
		scheduledQueue = new Queue<ScheduledJobData>(SCHEDULED_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 5000,
				},
				removeOnComplete: {
					age: 7 * 24 * 60 * 60, // 7 days
					count: 500,
				},
				removeOnFail: {
					age: 30 * 24 * 60 * 60, // 30 days
				},
			},
		});
	}
	return scheduledQueue;
}

export async function setupScheduledJobs(): Promise<void> {
	const queue = getScheduledQueue();

	// Process account deletions every hour
	await queue.upsertJobScheduler(
		"process-account-deletions",
		{
			pattern: "0 * * * *", // Every hour at minute 0
		},
		{
			name: "process-account-deletions",
			data: { type: "account-deletion" },
		},
	);

	// Reset daily quotas at midnight UTC
	await queue.upsertJobScheduler(
		"reset-daily-quotas",
		{
			pattern: "0 0 * * *", // Every day at midnight
		},
		{
			name: "reset-daily-quotas",
			data: { type: "quota-reset" },
		},
	);
}

export async function closeScheduledQueue(): Promise<void> {
	if (scheduledQueue) {
		await scheduledQueue.close();
		scheduledQueue = null;
	}
}

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

	// Watcher scheduler - dispatch due watcher checks every minute
	await queue.upsertJobScheduler(
		"watcher-scheduler",
		{
			pattern: "* * * * *", // Every minute
		},
		{
			name: "watcher-scheduler",
			data: { type: "watcher-scheduler" },
		},
	);

	// Sync online/offline status + daily usage from iRadius every 15 seconds
	// — same cadence as network-monitor-sync, mirroring iRadius's own monitor
	// refresh rate so the customers table feels live.
	await queue.upsertJobScheduler(
		"online-status-sync",
		{
			every: 15000,
		},
		{
			name: "online-status-sync",
			data: { type: "online-status-sync" },
		},
	);

	// Sync Station + AccessPoint monitor fields (online, uptime, signal, …)
	// from iRadius every 15 seconds — mirrors iRadius's own monitor cadence.
	await queue.upsertJobScheduler(
		"network-monitor-sync",
		{
			every: 15000,
		},
		{
			name: "network-monitor-sync",
			data: { type: "network-monitor-sync" },
		},
	);

	// Dealers + their receivable ledgers from iRadius every 30 minutes. The
	// owner's Dealers page reads the local mirror; before this the mirror only
	// moved when a platform admin pressed "Sync dealers" (prod was four days
	// and ~280 ledger rows behind on 2026-09-02).
	await queue.upsertJobScheduler(
		"dealer-sync",
		{
			pattern: "*/30 * * * *",
		},
		{
			name: "dealer-sync",
			data: { type: "dealer-sync" },
		},
	);

	// Watcher cleanup - delete old execution records daily at 2:30 AM
	await queue.upsertJobScheduler(
		"watcher-cleanup",
		{
			pattern: "30 2 * * *", // Daily at 2:30 AM
		},
		{
			name: "watcher-cleanup",
			data: { type: "watcher-cleanup" },
		},
	);
}

export async function closeScheduledQueue(): Promise<void> {
	if (scheduledQueue) {
		await scheduledQueue.close();
		scheduledQueue = null;
	}
}

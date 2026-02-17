import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { queueWatcherCheck } from "../jobs/watcher-check.jobs";
import { SCHEDULED_QUEUE_NAME } from "../queues/scheduled.queue";
import type { ScheduledJobData, ScheduledJobResult } from "../types";

async function processAccountDeletions(): Promise<number> {
	const now = new Date();

	// Find users whose deletion grace period has passed
	const usersToDelete = await db.user.findMany({
		where: {
			deletionScheduledAt: {
				lte: now,
			},
		},
		select: {
			id: true,
			email: true,
			deletionScheduledAt: true,
		},
	});

	logger.info(`Found ${usersToDelete.length} accounts to delete`);

	let deletedCount = 0;

	for (const user of usersToDelete) {
		try {
			// Delete user and all related data (cascades handled by Prisma)
			await db.user.delete({
				where: { id: user.id },
			});

			logger.info("Deleted user account", {
				userId: user.id,
				email: user.email,
			});
			deletedCount++;
		} catch (error) {
			logger.error("Failed to delete user account", {
				userId: user.id,
				error,
			});
		}
	}

	return deletedCount;
}

async function resetDailyQuotas(): Promise<number> {
	// Reset API call quotas that are daily
	const result = await db.usageQuota.updateMany({
		where: {
			quotaType: "apiCalls",
		},
		data: {
			used: 0,
			updatedAt: new Date(),
		},
	});

	logger.info(`Reset ${result.count} API call quotas`);
	return result.count;
}

async function dispatchDueWatchers(): Promise<number> {
	const now = new Date();

	const dueWatchers = await db.watcher.findMany({
		where: {
			enabled: true,
			nextRunAt: { lte: now },
		},
		select: {
			id: true,
			type: true,
			target: true,
			config: true,
			intervalSeconds: true,
		},
	});

	if (dueWatchers.length === 0) {
		return 0;
	}

	logger.info(`Dispatching ${dueWatchers.length} watcher checks`);

	for (const watcher of dueWatchers) {
		await queueWatcherCheck({
			watcherId: watcher.id,
			type: watcher.type,
			target: watcher.target,
			config: watcher.config as Record<string, unknown> | null,
		});

		// Advance nextRunAt so it won't be picked up again until the interval passes
		await db.watcher.update({
			where: { id: watcher.id },
			data: {
				nextRunAt: new Date(
					now.getTime() + watcher.intervalSeconds * 1000,
				),
			},
		});
	}

	return dueWatchers.length;
}

async function cleanupOldExecutions(): Promise<number> {
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const result = await db.watcherExecution.deleteMany({
		where: {
			createdAt: { lt: thirtyDaysAgo },
		},
	});

	logger.info(`Cleaned up ${result.count} old watcher executions`);
	return result.count;
}

export function createScheduledWorker(): Worker<
	ScheduledJobData,
	ScheduledJobResult
> {
	return new Worker<ScheduledJobData, ScheduledJobResult>(
		SCHEDULED_QUEUE_NAME,
		async (job: Job<ScheduledJobData>) => {
			const { type } = job.data;

			logger.info(`Processing scheduled job ${job.id}`, { type });

			switch (type) {
				case "account-deletion": {
					const deletedCount = await processAccountDeletions();
					return { processedCount: deletedCount };
				}
				case "quota-reset": {
					const resetCount = await resetDailyQuotas();
					return { processedCount: resetCount };
				}
				case "ai-credit-reset": {
					// AI credits removed - no-op
					return { processedCount: 0 };
				}
				case "watcher-scheduler": {
					const dispatched = await dispatchDueWatchers();
					return { processedCount: dispatched };
				}
				case "watcher-cleanup": {
					const cleaned = await cleanupOldExecutions();
					return { processedCount: cleaned };
				}
				default:
					throw new Error(`Unknown scheduled job type: ${type}`);
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: 3,
		},
	);
}

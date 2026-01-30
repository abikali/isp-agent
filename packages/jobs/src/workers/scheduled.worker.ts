import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
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

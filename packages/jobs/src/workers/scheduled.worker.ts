import { db } from "@repo/database";
import {
	queryIRadiusNetworkMonitor,
	queryIRadiusOnlineUserIds,
} from "@repo/database/iradius";
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

async function syncOnlineStatus(): Promise<number> {
	const onlineIds = await queryIRadiusOnlineUserIds();
	if (!onlineIds) {
		logger.warn("[Online Sync] Could not reach iRadius, skipping");
		return 0;
	}

	const [setOnline, setOffline] = await Promise.all([
		db.customer.updateMany({
			where: {
				externalId: { in: onlineIds },
				online: false,
			},
			data: { online: true },
		}),
		db.customer.updateMany({
			where: {
				externalId: { not: null, notIn: onlineIds },
				online: true,
			},
			data: { online: false },
		}),
	]);

	const updated = setOnline.count + setOffline.count;
	if (updated > 0) {
		logger.info(
			`[Online Sync] Updated ${updated} customers, ${onlineIds.length} online`,
		);
	}

	return updated;
}

async function syncNetworkMonitor(): Promise<number> {
	const snapshot = await queryIRadiusNetworkMonitor();
	if (!snapshot) {
		logger.warn("[Network Monitor Sync] Could not reach iRadius, skipping");
		return 0;
	}

	const stationUpdates = snapshot.stations.length
		? await db.$executeRaw`
			UPDATE "station" SET
				"online" = (v.value->>'online')::boolean,
				"uptime" = v.value->>'uptime',
				"boardName" = v.value->>'boardName',
				"cpuLoad" = v.value->>'cpuLoad',
				"voltage" = v.value->>'voltage',
				"version" = v.value->>'version',
				"scanStatus" = (v.value->>'scanStatus')::boolean,
				"lastSyncedAt" = NOW()
			FROM jsonb_array_elements(${JSON.stringify(snapshot.stations)}::jsonb) AS v(value)
			WHERE "station"."externalId" = v.value->>'externalId'
				AND (
					"station"."online" IS DISTINCT FROM (v.value->>'online')::boolean
					OR "station"."uptime" IS DISTINCT FROM v.value->>'uptime'
					OR "station"."boardName" IS DISTINCT FROM v.value->>'boardName'
					OR "station"."cpuLoad" IS DISTINCT FROM v.value->>'cpuLoad'
					OR "station"."voltage" IS DISTINCT FROM v.value->>'voltage'
					OR "station"."version" IS DISTINCT FROM v.value->>'version'
					OR "station"."scanStatus" IS DISTINCT FROM (v.value->>'scanStatus')::boolean
				)
		`
		: 0;

	const apUpdates = snapshot.accessPoints.length
		? await db.$executeRaw`
			UPDATE "access_point" SET
				"online" = (v.value->>'online')::boolean,
				"uptime" = v.value->>'uptime',
				"signal" = v.value->>'signal',
				"boardName" = v.value->>'boardName',
				"version" = v.value->>'version',
				"scanStatus" = (v.value->>'scanStatus')::boolean,
				"autoNegotiation" = (v.value->>'autoNegotiation')::boolean,
				"fullDuplex" = (v.value->>'fullDuplex')::boolean,
				"lastSyncedAt" = NOW()
			FROM jsonb_array_elements(${JSON.stringify(snapshot.accessPoints)}::jsonb) AS v(value)
			WHERE "access_point"."externalId" = v.value->>'externalId'
				AND (
					"access_point"."online" IS DISTINCT FROM (v.value->>'online')::boolean
					OR "access_point"."uptime" IS DISTINCT FROM v.value->>'uptime'
					OR "access_point"."signal" IS DISTINCT FROM v.value->>'signal'
					OR "access_point"."boardName" IS DISTINCT FROM v.value->>'boardName'
					OR "access_point"."version" IS DISTINCT FROM v.value->>'version'
					OR "access_point"."scanStatus" IS DISTINCT FROM (v.value->>'scanStatus')::boolean
					OR "access_point"."autoNegotiation" IS DISTINCT FROM (v.value->>'autoNegotiation')::boolean
					OR "access_point"."fullDuplex" IS DISTINCT FROM (v.value->>'fullDuplex')::boolean
				)
		`
		: 0;

	const total = Number(stationUpdates) + Number(apUpdates);
	if (total > 0) {
		logger.info(
			`[Network Monitor Sync] Refreshed ${stationUpdates} stations, ${apUpdates} access points`,
		);
	}
	return total;
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
				case "online-status-sync": {
					const synced = await syncOnlineStatus();
					return { processedCount: synced };
				}
				case "network-monitor-sync": {
					const synced = await syncNetworkMonitor();
					return { processedCount: synced };
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

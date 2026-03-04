import { config } from "@repo/config";
import { logger } from "@repo/logs";
import IORedis from "ioredis";

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
	if (!connection) {
		const redisUrl =
			config.rateLimit.redis?.url || process.env["REDIS_URL"] || "";

		if (!redisUrl) {
			throw new Error(
				"Redis URL not configured. Set REDIS_URL environment variable.",
			);
		}

		connection = new IORedis(redisUrl, {
			maxRetriesPerRequest: null, // Required for BullMQ
			enableReadyCheck: false,
		});

		connection.on("error", (error) => {
			logger.error("Redis connection error:", error);
		});

		connection.on("connect", () => {
			logger.info("Redis connected for job queue");

			// Clear stale AI locks/buffers from previous process (e.g. after deploy restart)
			connection
				?.keys("ai:lock:*")
				.then(async (keys) => {
					if (keys.length > 0) {
						await connection?.del(...keys);
						logger.info(
							`Cleared ${keys.length} stale AI lock(s) from previous process`,
						);
					}
				})
				.catch(() => {});
		});
	}

	return connection;
}

export async function closeConnection(): Promise<void> {
	if (connection) {
		await connection.quit();
		connection = null;
	}
}

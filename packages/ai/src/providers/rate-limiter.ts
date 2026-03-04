import { createHash } from "node:crypto";
import { logger } from "@repo/logs";

const SEND_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 30_000;
const JITTER_MS = 100;

/**
 * Minimal interface for the Redis commands we need.
 * Avoids importing ioredis directly (which lives in @repo/jobs).
 */
interface RedisClient {
	set(
		key: string,
		value: string,
		pxFlag: "PX",
		px: number,
		nxFlag: "NX",
	): Promise<string | null>;
	pttl(key: string): Promise<number>;
}

let redis: RedisClient | null = null;

/**
 * Initialize the rate limiter with an existing Redis connection.
 * Call this once at startup (e.g. in the worker process).
 */
export function initRateLimiter(client: RedisClient): void {
	redis = client;
}

function keyFor(apiToken: string): string {
	const hash = createHash("sha256")
		.update(apiToken)
		.digest("hex")
		.slice(0, 16);
	return `wa:throttle:${hash}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire a send slot for a WhatsApp account, blocking until available.
 * Uses Redis SET NX PX for atomic slot reservation (one message per 5s per account).
 * Fails open — if Redis is unavailable, returns immediately.
 */
export async function acquireSendSlot(apiToken: string): Promise<void> {
	if (!redis) {
		return;
	}

	const key = keyFor(apiToken);
	const deadline = Date.now() + MAX_WAIT_MS;

	while (Date.now() < deadline) {
		try {
			const acquired = await redis.set(
				key,
				"1",
				"PX",
				SEND_INTERVAL_MS,
				"NX",
			);
			if (acquired === "OK") {
				return;
			}

			// Slot taken — wait for remaining TTL
			const pttl = await redis.pttl(key);
			if (pttl > 0) {
				const jitter = Math.floor(Math.random() * JITTER_MS);
				await sleep(pttl + jitter);
			} else {
				// Key expired between SET and PTTL, retry immediately
				await sleep(50);
			}
		} catch (error) {
			// Fail open — Redis error should not block sending
			logger.warn("WhatsApp rate-limiter Redis error, failing open", {
				error,
			});
			return;
		}
	}

	// Timed out waiting — fail open rather than drop the message
	logger.warn("WhatsApp rate-limiter timed out waiting for slot, proceeding");
}

/**
 * Try to acquire a send slot without blocking.
 * Returns true if slot was acquired, false if unavailable.
 */
export async function trySendSlot(apiToken: string): Promise<boolean> {
	if (!redis) {
		return true; // Fail open
	}

	try {
		const key = keyFor(apiToken);
		const acquired = await redis.set(
			key,
			"1",
			"PX",
			SEND_INTERVAL_MS,
			"NX",
		);
		return acquired === "OK";
	} catch {
		return true; // Fail open
	}
}

/**
 * Try to acquire a typing indicator slot for a specific chat.
 * Uses a SEPARATE key prefix from message sending so typing never
 * blocks or gets blocked by actual message sends.
 * Returns true if slot was acquired, false if too recent.
 */
const TYPING_INTERVAL_MS = 3000;

export async function tryTypingSlot(
	apiToken: string,
	chatId: string,
): Promise<boolean> {
	if (!redis) {
		return true; // Fail open
	}

	try {
		const hash = createHash("sha256")
			.update(apiToken)
			.digest("hex")
			.slice(0, 16);
		const key = `wa:typing:${hash}:${chatId}`;
		const acquired = await redis.set(
			key,
			"1",
			"PX",
			TYPING_INTERVAL_MS,
			"NX",
		);
		return acquired === "OK";
	} catch {
		return true; // Fail open
	}
}

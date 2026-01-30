import { getRedisConnection } from "../connection";

const DAILY_LIMIT = 100;
const RECIPIENT_DAILY_LIMIT = 5; // Max follow-ups per email address per day
const WINDOW_SECONDS = 24 * 60 * 60; // 24 hours

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: Date;
}

/**
 * Check if a profile can send follow-up emails based on daily rate limit.
 * Uses a rolling 24-hour window with Redis.
 */
export async function checkFollowUpRateLimit(
	profileId: string,
): Promise<RateLimitResult> {
	const redis = getRedisConnection();
	const key = `followup:ratelimit:${profileId}`;
	const now = Date.now();
	const windowStart = now - WINDOW_SECONDS * 1000;

	// Remove expired entries and count current entries in one transaction
	const multi = redis.multi();
	multi.zremrangebyscore(key, 0, windowStart);
	multi.zcard(key);

	const results = await multi.exec();
	if (!results) {
		throw new Error("Redis transaction failed");
	}

	const countResult = results[1];
	const currentCount =
		(countResult && typeof countResult[1] === "number"
			? countResult[1]
			: 0) || 0;
	const remaining = Math.max(0, DAILY_LIMIT - currentCount);
	const allowed = currentCount < DAILY_LIMIT;

	// Calculate reset time (when the oldest entry will expire)
	let resetAt = new Date(now + WINDOW_SECONDS * 1000);

	if (currentCount > 0) {
		const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
		const oldestScore = oldest[1];
		if (oldest.length >= 2 && oldestScore) {
			const oldestTimestamp = Number.parseInt(oldestScore, 10);
			resetAt = new Date(oldestTimestamp + WINDOW_SECONDS * 1000);
		}
	}

	return {
		allowed,
		remaining,
		resetAt,
	};
}

/**
 * Record a follow-up email send for rate limiting purposes.
 * Should be called after successfully queueing a follow-up email.
 */
export async function recordFollowUpSend(profileId: string): Promise<void> {
	const redis = getRedisConnection();
	const key = `followup:ratelimit:${profileId}`;
	const now = Date.now();

	// Add the current timestamp and set expiry on the key
	await redis
		.multi()
		.zadd(key, now, `${now}`)
		.expire(key, WINDOW_SECONDS + 60) // Add 60s buffer
		.exec();
}

/**
 * Check if a recipient email can receive follow-up emails.
 * Limits to 5 follow-ups per email address per 24 hours across all profiles.
 * This prevents harassment of individual recipients.
 */
export async function checkRecipientRateLimit(
	recipientEmail: string,
): Promise<RateLimitResult> {
	const redis = getRedisConnection();
	const normalizedEmail = recipientEmail.toLowerCase().trim();
	const key = `followup:recipient:${normalizedEmail}`;
	const now = Date.now();
	const windowStart = now - WINDOW_SECONDS * 1000;

	// Remove expired entries and count current entries in one transaction
	const multi = redis.multi();
	multi.zremrangebyscore(key, 0, windowStart);
	multi.zcard(key);

	const results = await multi.exec();
	if (!results) {
		throw new Error("Redis transaction failed");
	}

	const countResult = results[1];
	const currentCount =
		(countResult && typeof countResult[1] === "number"
			? countResult[1]
			: 0) || 0;
	const remaining = Math.max(0, RECIPIENT_DAILY_LIMIT - currentCount);
	const allowed = currentCount < RECIPIENT_DAILY_LIMIT;

	// Calculate reset time (when the oldest entry will expire)
	let resetAt = new Date(now + WINDOW_SECONDS * 1000);

	if (currentCount > 0) {
		const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
		const oldestScore = oldest[1];
		if (oldest.length >= 2 && oldestScore) {
			const oldestTimestamp = Number.parseInt(oldestScore, 10);
			resetAt = new Date(oldestTimestamp + WINDOW_SECONDS * 1000);
		}
	}

	return {
		allowed,
		remaining,
		resetAt,
	};
}

/**
 * Record a follow-up email send for recipient rate limiting.
 * Should be called after successfully queueing a follow-up email.
 */
export async function recordRecipientFollowUp(
	recipientEmail: string,
): Promise<void> {
	const redis = getRedisConnection();
	const normalizedEmail = recipientEmail.toLowerCase().trim();
	const key = `followup:recipient:${normalizedEmail}`;
	const now = Date.now();

	// Add the current timestamp and set expiry on the key
	await redis
		.multi()
		.zadd(key, now, `${now}`)
		.expire(key, WINDOW_SECONDS + 60) // Add 60s buffer
		.exec();
}

import { config } from "@repo/config";
import { logger } from "@repo/logs";
import IORedis from "ioredis";
import { getMemoryStore } from "./store/memory";
import { createRedisStore } from "./store/redis";
import type {
	RateLimitCategory,
	RateLimitConfig,
	RateLimitIdentifier,
	RateLimitResult,
	RateLimitStore,
} from "./types";

// Lazy-initialized Redis connection for rate limiting
let redisConnection: IORedis | null = null;
let redisStore: RateLimitStore | null = null;
let redisInitPromise: Promise<RateLimitStore | null> | null = null;

/**
 * Build a rate limit key from the identifier
 */
function buildKey(
	category: RateLimitCategory,
	identifier: RateLimitIdentifier,
): string {
	const prefix = `${category}:`;

	switch (identifier.type) {
		case "user":
			return `${prefix}user:${identifier.userId}`;
		case "organization":
			return `${prefix}org:${identifier.organizationId}`;
		case "ip":
			return `${prefix}ip:${identifier.ip}`;
		case "api-key":
			return `${prefix}key:${identifier.keyId}`;
		case "custom":
			return `${prefix}custom:${identifier.key}`;
	}
}

/**
 * Initialize Redis store (used for deferred initialization)
 */
async function initializeRedisStore(): Promise<RateLimitStore | null> {
	if (redisStore) {
		return redisStore;
	}

	try {
		redisConnection = new IORedis(config.rateLimit.redis?.url ?? "", {
			maxRetriesPerRequest: 3,
			enableReadyCheck: false,
			lazyConnect: true,
		});

		redisConnection.on("error", (error: Error) => {
			logger.error("Rate limit Redis connection error:", error);
		});

		// Cast to our minimal RedisClient interface - ioredis is compatible
		redisStore = createRedisStore(
			redisConnection as unknown as Parameters<
				typeof createRedisStore
			>[0],
			"rate_limit:",
		);
		logger.info("Rate limit store initialized with Redis");
		return redisStore;
	} catch (error) {
		logger.error(
			"Failed to initialize Redis rate limit store, falling back to memory:",
			error,
		);
		return null;
	}
}

/**
 * Get the appropriate store based on configuration
 * Properly awaits Redis initialization to ensure consistent rate limiting
 */
async function getStore(): Promise<RateLimitStore> {
	// If Redis is not configured, use memory store
	if (config.rateLimit.store !== "redis" || !config.rateLimit.redis?.url) {
		return getMemoryStore();
	}

	// Return existing Redis store if already initialized
	if (redisStore) {
		return redisStore;
	}

	// Initialize Redis if not started, using singleton promise to prevent races
	if (!redisInitPromise) {
		redisInitPromise = initializeRedisStore();
	}

	// Await initialization - returns Redis store or null on failure
	const store = await redisInitPromise;

	// Fall back to memory store if Redis initialization failed
	return store ?? getMemoryStore();
}

/**
 * Check rate limit for an identifier
 * @returns Rate limit result with allowed status and remaining quota
 */
export async function checkRateLimit(
	category: RateLimitCategory,
	identifier: RateLimitIdentifier,
	customConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
	// If rate limiting is disabled, always allow
	if (!config.rateLimit.enabled) {
		return {
			allowed: true,
			remaining: Number.MAX_SAFE_INTEGER,
			limit: Number.MAX_SAFE_INTEGER,
			resetAt: Date.now() + 60000,
			retryAfter: 0,
		};
	}

	const limitConfig = customConfig ?? config.rateLimit.limits[category];
	const key = buildKey(category, identifier);

	try {
		const store = await getStore();
		return await store.increment(key, limitConfig.window, limitConfig.max);
	} catch (error) {
		// Fail open - allow requests when rate limiting is unavailable
		// This prevents service outage when Redis is down, at the cost of
		// temporarily allowing unrate-limited traffic during the outage
		logger.warn("Rate limit check failed - allowing request (fail-open)", {
			error,
			category,
			identifier,
		});
		return {
			allowed: true,
			remaining: limitConfig.max,
			limit: limitConfig.max,
			resetAt: Date.now() + limitConfig.window,
			retryAfter: 0,
		};
	}
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
	category: RateLimitCategory,
	identifier: RateLimitIdentifier,
	customConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
	if (!config.rateLimit.enabled) {
		return {
			allowed: true,
			remaining: Number.MAX_SAFE_INTEGER,
			limit: Number.MAX_SAFE_INTEGER,
			resetAt: Date.now() + 60000,
			retryAfter: 0,
		};
	}

	const limitConfig = customConfig ?? config.rateLimit.limits[category];
	const key = buildKey(category, identifier);

	try {
		const store = await getStore();
		return await store.get(key, limitConfig.window, limitConfig.max);
	} catch (error) {
		// Fail open for consistency with checkRateLimit
		logger.warn(
			"Rate limit status check failed - returning full quota (fail-open)",
			{
				error,
				category,
				identifier,
			},
		);
		return {
			allowed: true,
			remaining: limitConfig.max,
			limit: limitConfig.max,
			resetAt: Date.now() + limitConfig.window,
			retryAfter: 0,
		};
	}
}

/**
 * Reset rate limit for an identifier
 */
export async function resetRateLimit(
	category: RateLimitCategory,
	identifier: RateLimitIdentifier,
): Promise<void> {
	const key = buildKey(category, identifier);

	try {
		const store = await getStore();
		await store.reset(key);
	} catch (error) {
		logger.error("Rate limit reset failed", {
			error,
			category,
			identifier,
		});
	}
}

/**
 * Create rate limit headers for HTTP responses
 */
export function createRateLimitHeaders(result: RateLimitResult): {
	"X-RateLimit-Limit": string;
	"X-RateLimit-Remaining": string;
	"X-RateLimit-Reset": string;
	"Retry-After"?: string;
} {
	const headers: {
		"X-RateLimit-Limit": string;
		"X-RateLimit-Remaining": string;
		"X-RateLimit-Reset": string;
		"Retry-After"?: string;
	} = {
		"X-RateLimit-Limit": String(result.limit),
		"X-RateLimit-Remaining": String(result.remaining),
		"X-RateLimit-Reset": String(result.resetAt),
	};

	if (!result.allowed && result.retryAfter > 0) {
		headers["Retry-After"] = String(result.retryAfter);
	}

	return headers;
}

/**
 * Cleanup Redis connection for graceful shutdown
 */
export async function cleanup(): Promise<void> {
	if (redisConnection) {
		try {
			await redisConnection.quit();
			redisConnection = null;
			redisStore = null;
			redisInitPromise = null;
			logger.info("Rate limit Redis connection closed");
		} catch (error) {
			logger.error("Error closing rate limit Redis connection:", error);
		}
	}
}

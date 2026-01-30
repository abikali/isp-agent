/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Number of remaining requests in the window */
	remaining: number;
	/** Total limit for the window */
	limit: number;
	/** Timestamp when the rate limit resets (ms since epoch) */
	resetAt: number;
	/** Seconds until reset (for Retry-After header) */
	retryAfter: number;
}

/**
 * Configuration for a rate limit rule
 */
export interface RateLimitConfig {
	/** Time window in milliseconds */
	window: number;
	/** Maximum number of requests allowed in the window */
	max: number;
}

/**
 * Rate limit store interface - can be implemented by different backends
 */
export interface RateLimitStore {
	/**
	 * Increment the counter for a key and return rate limit info
	 * @param key - Unique identifier (e.g., user ID, IP address)
	 * @param window - Time window in milliseconds
	 * @param max - Maximum requests allowed
	 */
	increment(
		key: string,
		window: number,
		max: number,
	): Promise<RateLimitResult>;

	/**
	 * Reset the counter for a key
	 * @param key - Unique identifier
	 */
	reset(key: string): Promise<void>;

	/**
	 * Get current count without incrementing
	 * @param key - Unique identifier
	 * @param window - Time window in milliseconds
	 * @param max - Maximum requests allowed
	 */
	get(key: string, window: number, max: number): Promise<RateLimitResult>;
}

/**
 * Rate limit identifiers
 */
export type RateLimitIdentifier =
	| { type: "user"; userId: string }
	| { type: "organization"; organizationId: string }
	| { type: "ip"; ip: string }
	| { type: "api-key"; keyId: string }
	| { type: "custom"; key: string };

/**
 * Built-in rate limit categories
 */
export type RateLimitCategory = "api" | "auth" | "upload" | "webhook";

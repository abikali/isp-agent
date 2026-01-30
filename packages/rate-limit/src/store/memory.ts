import type { RateLimitResult, RateLimitStore } from "../types";

interface WindowData {
	count: number;
	startTime: number;
}

/**
 * In-memory rate limit store using sliding window algorithm
 * Suitable for development and single-instance deployments
 */
export class MemoryStore implements RateLimitStore {
	private windows: Map<string, WindowData> = new Map();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor(cleanupIntervalMs = 60000) {
		// Periodically clean up expired windows
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, cleanupIntervalMs);
	}

	async increment(
		key: string,
		window: number,
		max: number,
	): Promise<RateLimitResult> {
		const now = Date.now();
		const windowData = this.windows.get(key);

		// If no existing window or window has expired, start a new one
		if (!windowData || now - windowData.startTime >= window) {
			this.windows.set(key, { count: 1, startTime: now });
			return {
				allowed: true,
				remaining: max - 1,
				limit: max,
				resetAt: now + window,
				retryAfter: 0,
			};
		}

		// Increment existing window
		windowData.count++;

		const resetAt = windowData.startTime + window;
		const retryAfter = Math.ceil((resetAt - now) / 1000);
		const remaining = Math.max(0, max - windowData.count);
		const allowed = windowData.count <= max;

		return {
			allowed,
			remaining,
			limit: max,
			resetAt,
			retryAfter: allowed ? 0 : retryAfter,
		};
	}

	async reset(key: string): Promise<void> {
		this.windows.delete(key);
	}

	async get(
		key: string,
		window: number,
		max: number,
	): Promise<RateLimitResult> {
		const now = Date.now();
		const windowData = this.windows.get(key);

		// No existing window
		if (!windowData || now - windowData.startTime >= window) {
			return {
				allowed: true,
				remaining: max,
				limit: max,
				resetAt: now + window,
				retryAfter: 0,
			};
		}

		const resetAt = windowData.startTime + window;
		const retryAfter = Math.ceil((resetAt - now) / 1000);
		const remaining = Math.max(0, max - windowData.count);
		const allowed = windowData.count < max;

		return {
			allowed,
			remaining,
			limit: max,
			resetAt,
			retryAfter: allowed ? 0 : retryAfter,
		};
	}

	/**
	 * Clean up expired windows to prevent memory leaks
	 */
	private cleanup(): void {
		const now = Date.now();
		// Use a generous cleanup window (5 minutes) to avoid cleaning up too aggressively
		const maxAge = 5 * 60 * 1000;

		for (const [key, data] of this.windows.entries()) {
			if (now - data.startTime > maxAge) {
				this.windows.delete(key);
			}
		}
	}

	/**
	 * Stop the cleanup interval (for graceful shutdown)
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.windows.clear();
	}
}

// Singleton instance
let memoryStore: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
	if (!memoryStore) {
		memoryStore = new MemoryStore();
	}
	return memoryStore;
}

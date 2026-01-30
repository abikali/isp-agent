import IORedis from "ioredis";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { createRedisStore } from "../store/redis";

/**
 * Integration tests for Redis rate limit store
 *
 * These tests require a running Redis instance.
 * Set REDIS_URL environment variable or defaults to redis://localhost:6379
 *
 * Run with: REDIS_URL=redis://localhost:6379 pnpm test:run
 * Skip integration tests by setting SKIP_INTEGRATION=true
 */

const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";
const TEST_PREFIX = "test_rate_limit_integration:";

// Helper to check Redis availability
async function isRedisAvailable(): Promise<boolean> {
	const testClient = new IORedis(REDIS_URL, {
		maxRetriesPerRequest: 1,
		enableOfflineQueue: false,
		connectTimeout: 2000,
		lazyConnect: true,
	});

	try {
		await testClient.connect();
		await testClient.ping();
		await testClient.quit();
		return true;
	} catch {
		try {
			await testClient.quit();
		} catch {
			// Ignore cleanup errors
		}
		return false;
	}
}

describe("Redis Rate Limit Store - Integration Tests", async () => {
	const redisAvailable = await isRedisAvailable();

	if (!redisAvailable) {
		it.skip("skipping integration tests - Redis not available", () => {});
		return;
	}

	let redis: IORedis;
	let store: ReturnType<typeof createRedisStore>;

	beforeAll(async () => {
		redis = new IORedis(REDIS_URL, {
			maxRetriesPerRequest: 3,
			enableReadyCheck: false,
		});
		await redis.ping();
	});

	afterAll(async () => {
		// Clean up all test keys
		const keys = await redis.keys(`${TEST_PREFIX}*`);
		if (keys.length > 0) {
			await redis.del(...keys);
		}
		await redis.quit();
	});

	beforeEach(() => {
		store = createRedisStore(redis, TEST_PREFIX);
	});

	afterEach(async () => {
		// Clean up test keys after each test
		const keys = await redis.keys(`${TEST_PREFIX}*`);
		if (keys.length > 0) {
			await redis.del(...keys);
		}
	});

	describe("basic operations", () => {
		it("increments counter and returns correct result", async () => {
			const result = await store.increment("int:user:1", 60000, 10);

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(9);
			expect(result.limit).toBe(10);
			expect(result.resetAt).toBeGreaterThan(Date.now());
			expect(result.retryAfter).toBe(0);
		});

		it("blocks after limit reached", async () => {
			// Exhaust the limit
			for (let i = 0; i < 10; i++) {
				await store.increment("int:user:2", 60000, 10);
			}

			const blocked = await store.increment("int:user:2", 60000, 10);

			expect(blocked.allowed).toBe(false);
			expect(blocked.remaining).toBe(0);
			expect(blocked.retryAfter).toBeGreaterThan(0);
		});

		it("resets counter correctly", async () => {
			// Make some requests
			await store.increment("int:user:3", 60000, 10);
			await store.increment("int:user:3", 60000, 10);
			await store.increment("int:user:3", 60000, 10);

			// Reset
			await store.reset("int:user:3");

			// Should have full limit again
			const result = await store.increment("int:user:3", 60000, 10);
			expect(result.remaining).toBe(9);
		});

		it("gets current status without incrementing", async () => {
			await store.increment("int:user:4", 60000, 10);
			await store.increment("int:user:4", 60000, 10);

			const status = await store.get("int:user:4", 60000, 10);

			expect(status.remaining).toBe(8);

			// Should still be 8 after get
			const statusAfter = await store.get("int:user:4", 60000, 10);
			expect(statusAfter.remaining).toBe(8);
		});
	});

	describe("sliding window behavior", () => {
		it("expires keys after window", async () => {
			// Use a very short window for testing
			const shortWindow = 100; // 100ms

			await store.increment("int:expiry:1", shortWindow, 5);
			await store.increment("int:expiry:1", shortWindow, 5);

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Should have full limit again
			const result = await store.increment(
				"int:expiry:1",
				shortWindow,
				5,
			);
			expect(result.remaining).toBe(4);
		});

		it("maintains count within window", async () => {
			const window = 1000; // 1 second

			await store.increment("int:window:1", window, 10);
			await store.increment("int:window:1", window, 10);

			// Small delay, still within window
			await new Promise((resolve) => setTimeout(resolve, 100));

			await store.increment("int:window:1", window, 10);

			const result = await store.get("int:window:1", window, 10);
			expect(result.remaining).toBe(7);
		});
	});

	describe("concurrent access", () => {
		it("handles concurrent increments atomically", async () => {
			const concurrentRequests = 50;
			const limit = 20;

			// Fire all requests concurrently
			const results = await Promise.all(
				Array.from({ length: concurrentRequests }, (_, i) =>
					store.increment(`int:concurrent:${i % 5}`, 60000, limit),
				),
			);

			// For each user (0-4), exactly 20 should be allowed
			const groupedResults = new Map<number, typeof results>();
			for (let i = 0; i < concurrentRequests; i++) {
				const userGroup = i % 5;
				const result = results[i];
				if (!result) {
					continue;
				}
				const existing = groupedResults.get(userGroup);
				if (existing) {
					existing.push(result);
				} else {
					groupedResults.set(userGroup, [result]);
				}
			}

			// Each group has 10 requests, limit is 20, so all should be allowed
			for (const [_, groupResults] of groupedResults) {
				const allowed = groupResults.filter((r) => r.allowed).length;
				expect(allowed).toBe(10); // 50/5 = 10 requests per user
			}
		});

		it("handles high concurrency burst", async () => {
			const burstSize = 100;
			const limit = 50;

			const results = await Promise.all(
				Array.from({ length: burstSize }, () =>
					store.increment("int:burst:1", 60000, limit),
				),
			);

			const allowed = results.filter((r) => r.allowed).length;
			const blocked = results.filter((r) => !r.allowed).length;

			expect(allowed).toBe(limit);
			expect(blocked).toBe(burstSize - limit);
		});
	});

	describe("edge cases with real Redis", () => {
		it("handles very short TTL", async () => {
			const result = await store.increment("int:short:1", 10, 5);
			expect(result.allowed).toBe(true);

			// Wait for expiry
			await new Promise((resolve) => setTimeout(resolve, 20));

			const afterExpiry = await store.increment("int:short:1", 10, 5);
			expect(afterExpiry.remaining).toBe(4);
		});

		it("handles limit of 1", async () => {
			const first = await store.increment("int:limit1:1", 60000, 1);
			expect(first.allowed).toBe(true);
			expect(first.remaining).toBe(0);

			const second = await store.increment("int:limit1:1", 60000, 1);
			expect(second.allowed).toBe(false);
		});

		it("handles different keys independently", async () => {
			// Exhaust user 1
			for (let i = 0; i < 5; i++) {
				await store.increment("int:multi:user1", 60000, 5);
			}

			// User 2 should still have full quota
			const user2 = await store.increment("int:multi:user2", 60000, 5);
			expect(user2.allowed).toBe(true);
			expect(user2.remaining).toBe(4);
		});

		it("preserves data across operations", async () => {
			// Increment
			await store.increment("int:preserve:1", 60000, 10);
			await store.increment("int:preserve:1", 60000, 10);

			// Get status
			const status1 = await store.get("int:preserve:1", 60000, 10);
			expect(status1.remaining).toBe(8);

			// More increments
			await store.increment("int:preserve:1", 60000, 10);

			// Status should reflect all increments
			const status2 = await store.get("int:preserve:1", 60000, 10);
			expect(status2.remaining).toBe(7);
		});
	});

	describe("Lua script atomicity", () => {
		it("maintains atomicity under load", async () => {
			const operations = 200;
			const limit = 100;

			// Run many concurrent operations
			const results = await Promise.all(
				Array.from({ length: operations }, () =>
					store.increment("int:atomic:1", 60000, limit),
				),
			);

			// Exactly 100 should be allowed
			const allowed = results.filter((r) => r.allowed).length;
			expect(allowed).toBe(limit);

			// Remaining should be 0 for allowed ones at the end
			const finalStatus = await store.get("int:atomic:1", 60000, limit);
			expect(finalStatus.remaining).toBe(0);
		});
	});
});

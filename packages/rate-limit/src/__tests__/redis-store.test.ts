import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRedisStore, RedisStore } from "../store/redis";

/**
 * Comprehensive tests for Redis rate limit store
 * Tests sliding window algorithm, edge cases, and concurrent access patterns
 */

// Mock Redis client for unit testing
function createMockRedisClient() {
	const storage = new Map<string, { value: string; expiry: number }>();

	return {
		storage,
		eval: vi.fn(
			async (
				_script: string,
				_numkeys: number,
				key: string,
				window: number,
				max: number,
				now: number,
			) => {
				// Simulate the Lua script behavior
				const stored = storage.get(key);
				let count = 0;
				let startTime = now;

				if (stored && stored.expiry > Date.now()) {
					const parts = stored.value.split(":");
					const startPart = parts[0];
					const countPart = parts[1];
					const storedStartTime = startPart
						? Number.parseInt(startPart, 10)
						: 0;
					const storedCount = countPart
						? Number.parseInt(countPart, 10)
						: 0;

					if (now - storedStartTime < window) {
						startTime = storedStartTime;
						count = storedCount;
					}
				}

				count = count + 1;
				storage.set(key, {
					value: `${startTime}:${count}`,
					expiry: Date.now() + window,
				});

				const resetAt = startTime + window;
				const remaining = Math.max(0, max - count);
				const allowed = count <= max ? 1 : 0;
				const retryAfter =
					allowed === 1 ? 0 : Math.ceil((resetAt - now) / 1000);

				return [allowed, remaining, max, resetAt, retryAfter];
			},
		),
		get: vi.fn(async (key: string) => {
			const stored = storage.get(key);
			if (!stored || stored.expiry < Date.now()) {
				return null;
			}
			return stored.value;
		}),
		del: vi.fn(async (key: string) => {
			const existed = storage.has(key);
			storage.delete(key);
			return existed ? 1 : 0;
		}),
	};
}

describe("RedisStore", () => {
	let mockClient: ReturnType<typeof createMockRedisClient>;
	let store: RedisStore;

	beforeEach(() => {
		vi.clearAllMocks();
		mockClient = createMockRedisClient();
		store = createRedisStore(mockClient, "test_rate_limit:");
	});

	afterEach(() => {
		mockClient.storage.clear();
	});

	describe("increment", () => {
		it("allows first request within limit", async () => {
			const result = await store.increment("user:123", 60000, 10);

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(9);
			expect(result.limit).toBe(10);
			expect(result.retryAfter).toBe(0);
		});

		it("decrements remaining count correctly", async () => {
			const results = [];
			for (let i = 0; i < 5; i++) {
				results.push(await store.increment("user:123", 60000, 10));
			}

			expect(results[0]?.remaining).toBe(9);
			expect(results[1]?.remaining).toBe(8);
			expect(results[2]?.remaining).toBe(7);
			expect(results[3]?.remaining).toBe(6);
			expect(results[4]?.remaining).toBe(5);
		});

		it("blocks requests when limit is reached", async () => {
			// Make 10 requests (the limit)
			for (let i = 0; i < 10; i++) {
				await store.increment("user:123", 60000, 10);
			}

			// 11th request should be blocked
			const result = await store.increment("user:123", 60000, 10);

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
			expect(result.retryAfter).toBeGreaterThan(0);
		});

		it("handles exact limit boundary correctly", async () => {
			// Make exactly 10 requests
			let lastResult:
				| Awaited<ReturnType<typeof store.increment>>
				| undefined;
			for (let i = 0; i < 10; i++) {
				lastResult = await store.increment("user:123", 60000, 10);
			}

			expect(lastResult?.allowed).toBe(true);
			expect(lastResult?.remaining).toBe(0);

			// Next request should be blocked
			const blocked = await store.increment("user:123", 60000, 10);
			expect(blocked.allowed).toBe(false);
		});

		it("uses correct key prefix", async () => {
			await store.increment("user:123", 60000, 10);

			expect(mockClient.eval).toHaveBeenCalledWith(
				expect.any(String),
				1,
				"test_rate_limit:user:123",
				expect.any(Number),
				expect.any(Number),
				expect.any(Number),
			);
		});

		it("handles different users independently", async () => {
			// User 1 makes 10 requests
			for (let i = 0; i < 10; i++) {
				await store.increment("user:1", 60000, 10);
			}

			// User 2 should still have full limit
			const user2Result = await store.increment("user:2", 60000, 10);
			expect(user2Result.allowed).toBe(true);
			expect(user2Result.remaining).toBe(9);
		});

		it("calculates resetAt correctly", async () => {
			const beforeTime = Date.now();
			const result = await store.increment("user:123", 60000, 10);
			const afterTime = Date.now();

			// resetAt should be approximately now + window
			expect(result.resetAt).toBeGreaterThanOrEqual(beforeTime + 60000);
			expect(result.resetAt).toBeLessThanOrEqual(afterTime + 60000);
		});

		it("calculates retryAfter correctly when blocked", async () => {
			// Exhaust limit
			for (let i = 0; i < 10; i++) {
				await store.increment("user:123", 60000, 10);
			}

			const result = await store.increment("user:123", 60000, 10);

			// retryAfter should be less than or equal to window in seconds
			expect(result.retryAfter).toBeGreaterThan(0);
			expect(result.retryAfter).toBeLessThanOrEqual(60);
		});
	});

	describe("get", () => {
		it("returns full quota when no requests made", async () => {
			const result = await store.get("user:123", 60000, 10);

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(10);
			expect(result.limit).toBe(10);
		});

		it("returns correct count after increments", async () => {
			await store.increment("user:123", 60000, 10);
			await store.increment("user:123", 60000, 10);
			await store.increment("user:123", 60000, 10);

			const result = await store.get("user:123", 60000, 10);

			expect(result.remaining).toBe(7);
		});

		it("does not increment counter", async () => {
			await store.increment("user:123", 60000, 10);

			// Call get multiple times
			await store.get("user:123", 60000, 10);
			await store.get("user:123", 60000, 10);
			await store.get("user:123", 60000, 10);

			// Remaining should still be 9
			const result = await store.get("user:123", 60000, 10);
			expect(result.remaining).toBe(9);
		});
	});

	describe("reset", () => {
		it("clears rate limit for user", async () => {
			// Make some requests
			for (let i = 0; i < 5; i++) {
				await store.increment("user:123", 60000, 10);
			}

			// Reset
			await store.reset("user:123");

			// Should have full quota again
			const result = await store.increment("user:123", 60000, 10);
			expect(result.remaining).toBe(9);
		});

		it("only affects specified key", async () => {
			// Make requests for both users
			await store.increment("user:1", 60000, 10);
			await store.increment("user:1", 60000, 10);
			await store.increment("user:2", 60000, 10);

			// Reset only user 1
			await store.reset("user:1");

			// User 1 should be reset
			const user1Result = await store.get("user:1", 60000, 10);
			expect(user1Result.remaining).toBe(10);

			// User 2 should still have 9 remaining
			const user2Result = await store.get("user:2", 60000, 10);
			expect(user2Result.remaining).toBe(9);
		});
	});

	describe("edge cases", () => {
		it("handles very short window (1ms)", async () => {
			const result = await store.increment("user:123", 1, 10);
			expect(result.allowed).toBe(true);
		});

		it("handles very long window (24 hours)", async () => {
			const result = await store.increment("user:123", 86400000, 1000);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(999);
		});

		it("handles max limit of 1", async () => {
			const first = await store.increment("user:123", 60000, 1);
			expect(first.allowed).toBe(true);
			expect(first.remaining).toBe(0);

			const second = await store.increment("user:123", 60000, 1);
			expect(second.allowed).toBe(false);
		});

		it("handles very large limit", async () => {
			const result = await store.increment("user:123", 60000, 1000000);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(999999);
		});

		it("handles special characters in key", async () => {
			const keys = [
				"user:123:action",
				"ip:192.168.1.1",
				"api-key:abc-def-ghi",
				"custom:email@example.com",
			];

			for (const key of keys) {
				const result = await store.increment(key, 60000, 10);
				expect(result.allowed).toBe(true);
			}
		});

		it("handles empty key", async () => {
			const result = await store.increment("", 60000, 10);
			expect(result.allowed).toBe(true);
		});

		it("handles unicode in key", async () => {
			const result = await store.increment("user:日本語", 60000, 10);
			expect(result.allowed).toBe(true);
		});
	});

	describe("sliding window behavior", () => {
		it("resets after window expires", async () => {
			// This test uses the mock's expiry simulation
			// In real Redis, the key would expire after the window

			// Make requests up to limit
			for (let i = 0; i < 10; i++) {
				await store.increment("user:123", 100, 10); // 100ms window
			}

			// Should be blocked
			let result = await store.increment("user:123", 100, 10);
			expect(result.allowed).toBe(false);

			// Wait for window to expire (simulated by clearing mock storage)
			mockClient.storage.clear();

			// Should be allowed again
			result = await store.increment("user:123", 100, 10);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(9);
		});
	});

	describe("concurrent requests simulation", () => {
		it("handles multiple concurrent increments", async () => {
			// Simulate 20 concurrent requests
			const promises = Array.from({ length: 20 }, () =>
				store.increment("user:123", 60000, 10),
			);

			const results = await Promise.all(promises);

			// First 10 should be allowed
			const allowed = results.filter((r) => r.allowed).length;
			const blocked = results.filter((r) => !r.allowed).length;

			expect(allowed).toBe(10);
			expect(blocked).toBe(10);
		});

		it("handles burst traffic pattern", async () => {
			// Quick burst of 5 requests
			const burst1 = await Promise.all([
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
			]);

			// All should be allowed
			expect(burst1.every((r) => r.allowed)).toBe(true);

			// Another burst of 5
			const burst2 = await Promise.all([
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
				store.increment("user:123", 60000, 10),
			]);

			// All should be allowed (total 10)
			expect(burst2.every((r) => r.allowed)).toBe(true);

			// Next request should be blocked
			const blocked = await store.increment("user:123", 60000, 10);
			expect(blocked.allowed).toBe(false);
		});
	});
});

describe("createRedisStore factory", () => {
	it("creates store with default prefix", () => {
		const mockClient = createMockRedisClient();
		const store = createRedisStore(mockClient);

		expect(store).toBeInstanceOf(RedisStore);
	});

	it("creates store with custom prefix", () => {
		const mockClient = createMockRedisClient();
		const store = createRedisStore(mockClient, "custom:");

		expect(store).toBeInstanceOf(RedisStore);
	});
});

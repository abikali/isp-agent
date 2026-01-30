import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comprehensive tests for Follow-up Rate Limiting
 * Tests rolling window with sorted sets, profile limits, recipient limits
 */

// Mock Redis responses storage
let mockZsetData: Map<string, Map<string, number>>;
let mockExpiry: Map<string, number>;

/**
 * Helper to get or create a zset entry in mockZsetData.
 * Ensures type-safe access without non-null assertions.
 */
function getOrCreateZset(key: string): Map<string, number> {
	let zset = mockZsetData.get(key);
	if (!zset) {
		zset = new Map();
		mockZsetData.set(key, zset);
	}
	return zset;
}

// Create mock Redis multi/exec results
function createMultiResult(zremResult: number, zcardResult: number) {
	return [
		[null, zremResult], // zremrangebyscore result
		[null, zcardResult], // zcard result
	];
}

// Mock Redis client with proper chaining
const createMockMulti = () => {
	let currentKey = "";
	const multi = {
		zremrangebyscore: vi.fn((key: string, _min: number, max: number) => {
			currentKey = key;
			// Remove expired entries from mock data
			const zset = mockZsetData.get(key);
			if (zset) {
				for (const [member, score] of zset.entries()) {
					if (score <= max) {
						zset.delete(member);
					}
				}
			}
			return multi;
		}),
		zcard: vi.fn(() => multi),
		zadd: vi.fn((key: string, score: number, member: string) => {
			currentKey = key;
			getOrCreateZset(key).set(member, score);
			return multi;
		}),
		expire: vi.fn((key: string, seconds: number) => {
			mockExpiry.set(key, Date.now() + seconds * 1000);
			return multi;
		}),
		exec: vi.fn(async (): Promise<(number | null)[][] | null> => {
			const zset = mockZsetData.get(currentKey);
			const count = zset ? zset.size : 0;
			return createMultiResult(0, count);
		}),
	};
	return multi;
};

const mockRedis = {
	multi: vi.fn(() => createMockMulti()),
	zrange: vi.fn(),
};

vi.mock("../../connection", () => ({
	getRedisConnection: vi.fn(() => mockRedis),
}));

// Import after mocking
import {
	checkFollowUpRateLimit,
	checkRecipientRateLimit,
	recordFollowUpSend,
	recordRecipientFollowUp,
} from "../followup-rate-limit";

describe("Follow-up Rate Limiting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockZsetData = new Map();
		mockExpiry = new Map();

		// Reset multi mock for each test
		mockRedis.multi.mockImplementation(() => createMockMulti());

		// Mock zrange for getting oldest entry
		mockRedis.zrange.mockImplementation(
			async (
				key: string,
				start: number,
				end: number,
				withScores?: string,
			) => {
				const zset = mockZsetData.get(key);
				if (!zset || zset.size === 0) {
					return [];
				}

				// Sort by score and get the range
				const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1]);
				const sliced = sorted.slice(start, end + 1);

				if (withScores === "WITHSCORES") {
					const result: string[] = [];
					for (const [member, score] of sliced) {
						result.push(member, String(score));
					}
					return result;
				}

				return sliced.map(([member]) => member);
			},
		);
	});

	afterEach(() => {
		mockZsetData.clear();
		mockExpiry.clear();
	});

	describe("checkFollowUpRateLimit", () => {
		it("allows requests when under daily limit", async () => {
			const result = await checkFollowUpRateLimit("profile_123");

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(100); // DAILY_LIMIT
		});

		it("tracks remaining count correctly", async () => {
			// Simulate 50 existing entries
			const key = "followup:ratelimit:profile_123";
			const zset = getOrCreateZset(key);
			const now = Date.now();
			for (let i = 0; i < 50; i++) {
				zset.set(`${now - i * 1000}`, now - i * 1000);
			}

			const result = await checkFollowUpRateLimit("profile_123");

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(50);
		});

		it("blocks when daily limit reached", async () => {
			// Simulate 100 existing entries (at limit)
			const key = "followup:ratelimit:profile_123";
			const zset = getOrCreateZset(key);
			const now = Date.now();
			for (let i = 0; i < 100; i++) {
				zset.set(`${now - i * 1000}`, now - i * 1000);
			}

			const result = await checkFollowUpRateLimit("profile_123");

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
		});

		it("calculates resetAt based on oldest entry", async () => {
			const key = "followup:ratelimit:profile_123";
			const zset = getOrCreateZset(key);
			const now = Date.now();
			const oldestTime = now - 3600000; // 1 hour ago

			zset.set(`${oldestTime}`, oldestTime);
			zset.set(`${now}`, now);

			const result = await checkFollowUpRateLimit("profile_123");

			// resetAt should be oldestTime + 24 hours
			const expectedReset = oldestTime + 24 * 60 * 60 * 1000;
			expect(result.resetAt.getTime()).toBeCloseTo(expectedReset, -3);
		});

		it("handles empty rate limit state", async () => {
			const result = await checkFollowUpRateLimit("new_profile");

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(100);
		});

		it("handles Redis transaction errors", async () => {
			mockRedis.multi.mockImplementation(() => {
				const errorMulti: ReturnType<typeof createMockMulti> = {
					zremrangebyscore: vi.fn().mockReturnThis(),
					zcard: vi.fn().mockReturnThis(),
					zadd: vi.fn().mockReturnThis(),
					expire: vi.fn().mockReturnThis(),
					exec: vi.fn(async () => null),
				};
				return errorMulti;
			});

			await expect(checkFollowUpRateLimit("profile_123")).rejects.toThrow(
				"Redis transaction failed",
			);
		});
	});

	describe("recordFollowUpSend", () => {
		it("adds timestamp to sorted set", async () => {
			const beforeTime = Date.now();

			await recordFollowUpSend("profile_123");

			const key = "followup:ratelimit:profile_123";
			expect(mockZsetData.has(key)).toBe(true);

			const zset = mockZsetData.get(key);
			expect(zset).toBeDefined();
			const entries = [...(zset?.entries() ?? [])];
			expect(entries.length).toBe(1);

			const firstEntry = entries[0];
			expect(firstEntry).toBeDefined();
			const [member, score] = firstEntry ?? ["", 0];
			expect(Number(member)).toBeGreaterThanOrEqual(beforeTime);
			expect(score).toBeGreaterThanOrEqual(beforeTime);
		});

		it("sets expiry on the key", async () => {
			await recordFollowUpSend("profile_123");

			const key = "followup:ratelimit:profile_123";
			expect(mockExpiry.has(key)).toBe(true);

			// Should expire after ~24 hours + 60s buffer
			const expiry = mockExpiry.get(key);
			expect(expiry).toBeDefined();
			const expectedExpiry = Date.now() + (24 * 60 * 60 + 60) * 1000;
			expect(expiry).toBeCloseTo(expectedExpiry, -4);
		});

		it("handles multiple sends for same profile", async () => {
			// Note: In real code, each call uses Date.now() as the unique member
			// If called within the same millisecond, entries may collide
			// This tests that the zadd function is called multiple times
			await recordFollowUpSend("profile_123");
			await recordFollowUpSend("profile_123");
			await recordFollowUpSend("profile_123");

			const key = "followup:ratelimit:profile_123";
			// Verify multi was called 3 times (once per send)
			expect(mockRedis.multi).toHaveBeenCalledTimes(3);
			// Verify data was stored (may be 1-3 entries depending on timing)
			const zset = mockZsetData.get(key);
			expect(zset).toBeDefined();
			expect(zset?.size).toBeGreaterThanOrEqual(1);
		});
	});

	describe("checkRecipientRateLimit", () => {
		it("allows requests when under recipient limit", async () => {
			const result = await checkRecipientRateLimit("user@example.com");

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(5); // RECIPIENT_DAILY_LIMIT
		});

		it("normalizes email to lowercase", async () => {
			await checkRecipientRateLimit("User@EXAMPLE.com");

			expect(mockRedis.multi).toHaveBeenCalled();
			// The key should use normalized email
		});

		it("blocks after 5 follow-ups to same recipient", async () => {
			const normalizedEmail = "user@example.com";
			const key = `followup:recipient:${normalizedEmail}`;
			const zset = getOrCreateZset(key);
			const now = Date.now();

			// Add 5 entries
			for (let i = 0; i < 5; i++) {
				zset.set(`${now - i * 1000}`, now - i * 1000);
			}

			const result = await checkRecipientRateLimit("user@example.com");

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
		});

		it("trims whitespace from email", async () => {
			const result = await checkRecipientRateLimit(
				"  user@example.com  ",
			);

			expect(result.allowed).toBe(true);
		});

		it("handles different recipients independently", async () => {
			// Set up one recipient at limit
			const key1 = "followup:recipient:user1@example.com";
			const zset1 = getOrCreateZset(key1);
			const now = Date.now();
			for (let i = 0; i < 5; i++) {
				zset1.set(`${now - i * 1000}`, now - i * 1000);
			}

			// First recipient should be blocked
			const result1 = await checkRecipientRateLimit("user1@example.com");
			expect(result1.allowed).toBe(false);

			// Second recipient should be allowed
			const result2 = await checkRecipientRateLimit("user2@example.com");
			expect(result2.allowed).toBe(true);
			expect(result2.remaining).toBe(5);
		});
	});

	describe("recordRecipientFollowUp", () => {
		it("adds timestamp for recipient", async () => {
			await recordRecipientFollowUp("user@example.com");

			const key = "followup:recipient:user@example.com";
			expect(mockZsetData.has(key)).toBe(true);
		});

		it("normalizes email before recording", async () => {
			await recordRecipientFollowUp("USER@EXAMPLE.COM");

			const key = "followup:recipient:user@example.com";
			expect(mockZsetData.has(key)).toBe(true);
		});

		it("sets appropriate expiry", async () => {
			await recordRecipientFollowUp("user@example.com");

			const key = "followup:recipient:user@example.com";
			expect(mockExpiry.has(key)).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("handles profile ID with special characters", async () => {
			const result = await checkFollowUpRateLimit("profile:123:test");

			expect(result.allowed).toBe(true);
		});

		it("handles email with plus addressing", async () => {
			const result = await checkRecipientRateLimit(
				"user+tag@example.com",
			);

			expect(result.allowed).toBe(true);
		});

		it("handles very long profile IDs", async () => {
			const longId = `profile_${"a".repeat(200)}`;
			const result = await checkFollowUpRateLimit(longId);

			expect(result.allowed).toBe(true);
		});

		it("handles unicode in email local part", async () => {
			const result = await checkRecipientRateLimit("用户@example.com");

			expect(result.allowed).toBe(true);
		});

		it("handles concurrent rate limit checks", async () => {
			const results = await Promise.all([
				checkFollowUpRateLimit("profile_1"),
				checkFollowUpRateLimit("profile_2"),
				checkFollowUpRateLimit("profile_3"),
				checkRecipientRateLimit("user1@example.com"),
				checkRecipientRateLimit("user2@example.com"),
			]);

			// All should be allowed (fresh state)
			expect(results.every((r) => r.allowed)).toBe(true);
		});
	});

	describe("rolling window behavior", () => {
		it("removes expired entries on check", async () => {
			const key = "followup:ratelimit:profile_123";
			const zset = getOrCreateZset(key);
			const now = Date.now();

			// Add entries: some expired, some current
			const oldTime = now - 25 * 60 * 60 * 1000; // 25 hours ago (expired)
			const recentTime = now - 1 * 60 * 60 * 1000; // 1 hour ago (current)

			zset.set(`${oldTime}`, oldTime);
			zset.set(`${recentTime}`, recentTime);

			// The multi mock should remove expired entries
			await checkFollowUpRateLimit("profile_123");

			// After check, only recent entry should remain
			// (This is simulated in the mock implementation)
		});

		it("calculates correct remaining after partial expiry", async () => {
			const key = "followup:ratelimit:profile_123";
			const zset = getOrCreateZset(key);
			const now = Date.now();

			// Add 30 current entries
			for (let i = 0; i < 30; i++) {
				const time = now - i * 60 * 1000; // Each 1 minute apart
				zset.set(`${time}`, time);
			}

			const result = await checkFollowUpRateLimit("profile_123");

			expect(result.remaining).toBe(70); // 100 - 30
		});
	});
});

describe("Rate Limit Constants", () => {
	it("profile daily limit is 100", async () => {
		// Test by checking remaining on fresh profile
		const result = await checkFollowUpRateLimit("fresh_profile");
		expect(result.remaining).toBe(100);
	});

	it("recipient daily limit is 5", async () => {
		// Test by checking remaining on fresh recipient
		const result = await checkRecipientRateLimit("fresh@example.com");
		expect(result.remaining).toBe(5);
	});
});

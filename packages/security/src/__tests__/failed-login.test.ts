import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyProgressiveDelay,
	calculateProgressiveDelay,
	clearFailedAttempts,
	getLoginHistory,
	getRecentFailedAttempts,
	recordLoginAttempt,
} from "../failed-login";

// Create mutable config mock using vi.hoisted to ensure it's available before vi.mock runs
const mockFailedLoginConfig = vi.hoisted(() => ({
	enabled: true as boolean,
	baseDelayMs: 1000,
	maxDelayMs: 30000,
	delayMultiplier: 2,
}));

// Mock dependencies
vi.mock("@repo/database", () => ({
	db: {
		loginAttempt: {
			create: vi.fn(),
			count: vi.fn(),
			findMany: vi.fn(),
		},
	},
}));

vi.mock("@repo/config", () => ({
	config: {
		security: {
			failedLogin: mockFailedLoginConfig,
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		debug: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("@paralleldrive/cuid2", () => ({
	createId: vi.fn(() => "test-attempt-id"),
}));

// Import mocked modules after mocking
import { db } from "@repo/database";

describe("recordLoginAttempt", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when failed login tracking is disabled", async () => {
		mockFailedLoginConfig.enabled = false;

		await recordLoginAttempt({
			email: "test@example.com",
			success: false,
		});

		expect(db.loginAttempt.create).not.toHaveBeenCalled();

		// Reset for other tests
		mockFailedLoginConfig.enabled = true;
	});

	it("creates a login attempt record for failed login", async () => {
		vi.mocked(db.loginAttempt.create).mockResolvedValue({
			id: "test-attempt-id",
			email: "test@example.com",
			userId: null,
			ipAddress: "192.168.1.1",
			userAgent: "Mozilla/5.0",
			success: false,
			failureReason: "invalid_password",
			createdAt: new Date(),
		});

		await recordLoginAttempt({
			email: "test@example.com",
			ipAddress: "192.168.1.1",
			userAgent: "Mozilla/5.0",
			success: false,
			failureReason: "invalid_password",
		});

		expect(db.loginAttempt.create).toHaveBeenCalledWith({
			data: {
				id: "test-attempt-id",
				email: "test@example.com",
				userId: null,
				ipAddress: "192.168.1.1",
				userAgent: "Mozilla/5.0",
				success: false,
				failureReason: "invalid_password",
			},
		});
	});

	it("creates a login attempt record for successful login", async () => {
		vi.mocked(db.loginAttempt.create).mockResolvedValue({
			id: "test-attempt-id",
			email: "test@example.com",
			userId: "user-123",
			ipAddress: "192.168.1.1",
			userAgent: "Mozilla/5.0",
			success: true,
			failureReason: null,
			createdAt: new Date(),
		});

		await recordLoginAttempt({
			email: "test@example.com",
			userId: "user-123",
			ipAddress: "192.168.1.1",
			userAgent: "Mozilla/5.0",
			success: true,
		});

		expect(db.loginAttempt.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				email: "test@example.com",
				userId: "user-123",
				success: true,
				failureReason: null,
			}),
		});
	});

	it("handles missing optional fields", async () => {
		vi.mocked(db.loginAttempt.create).mockResolvedValue({
			id: "test-attempt-id",
			email: "test@example.com",
			userId: null,
			ipAddress: null,
			userAgent: null,
			success: false,
			failureReason: null,
			createdAt: new Date(),
		});

		await recordLoginAttempt({
			email: "test@example.com",
			success: false,
		});

		expect(db.loginAttempt.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				userId: null,
				ipAddress: null,
				userAgent: null,
				failureReason: null,
			}),
		});
	});

	it("does not throw when database operation fails", async () => {
		vi.mocked(db.loginAttempt.create).mockRejectedValue(
			new Error("Database error"),
		);

		// Should not throw
		await expect(
			recordLoginAttempt({
				email: "test@example.com",
				success: false,
			}),
		).resolves.toBeUndefined();
	});
});

describe("getRecentFailedAttempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("counts failed attempts within default 15-minute window", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(3);

		const result = await getRecentFailedAttempts("test@example.com");

		expect(result).toBe(3);

		const expectedWindowStart = new Date(
			new Date("2024-01-15T10:00:00Z").getTime() - 15 * 60 * 1000,
		);

		expect(db.loginAttempt.count).toHaveBeenCalledWith({
			where: {
				email: "test@example.com",
				success: false,
				createdAt: {
					gte: expectedWindowStart,
				},
			},
		});
	});

	it("counts failed attempts within custom window", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(5);

		const result = await getRecentFailedAttempts("test@example.com", 30);

		expect(result).toBe(5);

		const expectedWindowStart = new Date(
			new Date("2024-01-15T10:00:00Z").getTime() - 30 * 60 * 1000,
		);

		expect(db.loginAttempt.count).toHaveBeenCalledWith({
			where: {
				email: "test@example.com",
				success: false,
				createdAt: {
					gte: expectedWindowStart,
				},
			},
		});
	});

	it("returns 0 when no failed attempts", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(0);

		const result = await getRecentFailedAttempts("test@example.com");

		expect(result).toBe(0);
	});
});

describe("calculateProgressiveDelay", () => {
	it("returns 0 for 0 failed attempts", () => {
		const result = calculateProgressiveDelay(0);
		expect(result).toBe(0);
	});

	it("returns 0 for negative failed attempts", () => {
		const result = calculateProgressiveDelay(-1);
		expect(result).toBe(0);
	});

	it("returns base delay for 1 failed attempt", () => {
		// baseDelayMs * multiplier^(1-1) = 1000 * 2^0 = 1000
		const result = calculateProgressiveDelay(1);
		expect(result).toBe(1000);
	});

	it("returns exponentially increasing delay for subsequent attempts", () => {
		// 1 attempt: 1000 * 2^0 = 1000
		expect(calculateProgressiveDelay(1)).toBe(1000);

		// 2 attempts: 1000 * 2^1 = 2000
		expect(calculateProgressiveDelay(2)).toBe(2000);

		// 3 attempts: 1000 * 2^2 = 4000
		expect(calculateProgressiveDelay(3)).toBe(4000);

		// 4 attempts: 1000 * 2^3 = 8000
		expect(calculateProgressiveDelay(4)).toBe(8000);

		// 5 attempts: 1000 * 2^4 = 16000
		expect(calculateProgressiveDelay(5)).toBe(16000);
	});

	it("caps delay at maxDelayMs", () => {
		// 6 attempts: 1000 * 2^5 = 32000, but maxDelayMs is 30000
		const result = calculateProgressiveDelay(6);
		expect(result).toBe(30000);

		// Even more attempts should still be capped
		expect(calculateProgressiveDelay(10)).toBe(30000);
	});
});

describe("applyProgressiveDelay", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns 0 when failed login tracking is disabled", async () => {
		mockFailedLoginConfig.enabled = false;

		const result = await applyProgressiveDelay("test@example.com");

		expect(result).toBe(0);
		expect(db.loginAttempt.count).not.toHaveBeenCalled();

		// Reset for other tests
		mockFailedLoginConfig.enabled = true;
	});

	it("returns 0 when no failed attempts", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(0);

		const result = await applyProgressiveDelay("test@example.com");

		expect(result).toBe(0);
	});

	it("applies correct delay for failed attempts", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(3);

		const delayPromise = applyProgressiveDelay("test@example.com");

		// Fast-forward time to allow setTimeout to complete
		await vi.advanceTimersByTimeAsync(4000);

		const result = await delayPromise;

		// 3 attempts = 1000 * 2^2 = 4000ms
		expect(result).toBe(4000);
	});

	it("does not apply delay when calculated delay is 0", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(0);

		const start = Date.now();
		await applyProgressiveDelay("test@example.com");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(100); // No significant delay
	});
});

describe("clearFailedAttempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("logs success message but does not delete records", async () => {
		// The function is a no-op that just logs
		await clearFailedAttempts("test@example.com");

		// Should not call any delete operations
		expect(db.loginAttempt.create).not.toHaveBeenCalled();
		expect(db.loginAttempt.count).not.toHaveBeenCalled();
	});
});

describe("getLoginHistory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns login history for a user with default limit", async () => {
		const mockHistory = [
			{
				id: "attempt-1",
				email: "test@example.com",
				userId: "user-123",
				ipAddress: "192.168.1.1",
				userAgent: "Chrome",
				success: true,
				failureReason: null,
				createdAt: new Date("2024-01-15T10:00:00Z"),
			},
			{
				id: "attempt-2",
				email: "test@example.com",
				userId: "user-123",
				ipAddress: "192.168.1.2",
				userAgent: "Firefox",
				success: false,
				failureReason: "invalid_password",
				createdAt: new Date("2024-01-15T09:00:00Z"),
			},
		];
		vi.mocked(db.loginAttempt.findMany).mockResolvedValue(mockHistory);

		const result = await getLoginHistory("user-123");

		expect(result).toEqual(mockHistory);
		expect(db.loginAttempt.findMany).toHaveBeenCalledWith({
			where: { userId: "user-123" },
			orderBy: { createdAt: "desc" },
			take: 20,
			select: {
				id: true,
				email: true,
				ipAddress: true,
				userAgent: true,
				success: true,
				failureReason: true,
				createdAt: true,
			},
		});
	});

	it("returns login history with custom limit", async () => {
		vi.mocked(db.loginAttempt.findMany).mockResolvedValue([]);

		await getLoginHistory("user-123", 50);

		expect(db.loginAttempt.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				take: 50,
			}),
		);
	});

	it("returns empty array when no login history", async () => {
		vi.mocked(db.loginAttempt.findMany).mockResolvedValue([]);

		const result = await getLoginHistory("user-123");

		expect(result).toEqual([]);
	});

	it("orders results by createdAt descending", async () => {
		vi.mocked(db.loginAttempt.findMany).mockResolvedValue([]);

		await getLoginHistory("user-123");

		expect(db.loginAttempt.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: { createdAt: "desc" },
			}),
		);
	});
});

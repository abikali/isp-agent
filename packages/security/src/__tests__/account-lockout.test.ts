import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getLockedAccounts,
	isAccountLocked,
	lockAccount,
	shouldLockAccount,
	unlockAccount,
} from "../account-lockout";

// Create mutable config mock using vi.hoisted to ensure it's available before vi.mock runs
const mockAccountLockoutConfig = vi.hoisted(() => ({
	enabled: true as boolean,
	maxFailedAttempts: 5,
	lockoutDurationMinutes: 30,
	notifyOnLockout: false as boolean,
}));

// Mock dependencies
vi.mock("@repo/database", () => ({
	db: {
		accountLockout: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			upsert: vi.fn(),
			update: vi.fn(),
		},
		loginAttempt: {
			count: vi.fn(),
		},
		user: {
			findUnique: vi.fn(),
		},
	},
}));

vi.mock("@repo/config", () => ({
	config: {
		security: {
			accountLockout: mockAccountLockoutConfig,
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock("@repo/mail", () => ({
	sendEmail: vi.fn(),
}));

vi.mock("@paralleldrive/cuid2", () => ({
	createId: vi.fn(() => "test-lockout-id"),
}));

// Import mocked db after mocking
import { db } from "@repo/database";

describe("isAccountLocked", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns { locked: false } when account lockout is disabled", async () => {
		mockAccountLockoutConfig.enabled = false;

		const result = await isAccountLocked("user-123");

		expect(result).toEqual({ locked: false });
		expect(db.accountLockout.findUnique).not.toHaveBeenCalled();

		// Reset for other tests
		mockAccountLockoutConfig.enabled = true;
	});

	it("returns { locked: false } when no lockout record exists", async () => {
		vi.mocked(db.accountLockout.findUnique).mockResolvedValue(null);

		const result = await isAccountLocked("user-123");

		expect(result).toEqual({ locked: false });
		expect(db.accountLockout.findUnique).toHaveBeenCalledWith({
			where: { userId: "user-123" },
		});
	});

	it("returns { locked: false } when account has been manually unlocked", async () => {
		vi.mocked(db.accountLockout.findUnique).mockResolvedValue({
			id: "lockout-1",
			userId: "user-123",
			lockedAt: new Date("2024-01-15T09:00:00Z"),
			unlocksAt: new Date("2024-01-15T10:30:00Z"),
			unlockedAt: new Date("2024-01-15T09:30:00Z"), // Manually unlocked
			unlockedBy: "admin-user",
			failedAttempts: 5,
			reason: "too_many_failed_attempts",
		});

		const result = await isAccountLocked("user-123");

		expect(result).toEqual({ locked: false });
	});

	it("auto-unlocks and returns { locked: false } when lockout has expired", async () => {
		// Current time: 10:00, lockout expired at 09:30
		vi.mocked(db.accountLockout.findUnique).mockResolvedValue({
			id: "lockout-1",
			userId: "user-123",
			lockedAt: new Date("2024-01-15T09:00:00Z"),
			unlocksAt: new Date("2024-01-15T09:30:00Z"), // Already expired
			unlockedAt: null,
			unlockedBy: null,
			failedAttempts: 5,
			reason: "too_many_failed_attempts",
		});

		const result = await isAccountLocked("user-123");

		expect(result).toEqual({ locked: false });
		expect(db.accountLockout.update).toHaveBeenCalledWith({
			where: { userId: "user-123" },
			data: {
				unlockedAt: expect.any(Date),
				unlockedBy: "system_auto",
			},
		});
	});

	it("returns { locked: true, lockout } when account is actively locked", async () => {
		const lockoutRecord = {
			id: "lockout-1",
			userId: "user-123",
			lockedAt: new Date("2024-01-15T09:30:00Z"),
			unlocksAt: new Date("2024-01-15T10:30:00Z"), // Expires in 30 minutes
			unlockedAt: null,
			unlockedBy: null,
			failedAttempts: 5,
			reason: "too_many_failed_attempts",
		};
		vi.mocked(db.accountLockout.findUnique).mockResolvedValue(
			lockoutRecord,
		);

		const result = await isAccountLocked("user-123");

		expect(result).toEqual({
			locked: true,
			lockout: {
				userId: "user-123",
				lockedAt: lockoutRecord.lockedAt,
				unlocksAt: lockoutRecord.unlocksAt,
				failedAttempts: 5,
				reason: "too_many_failed_attempts",
			},
		});
	});

	it("excludes reason from lockout info when reason is null", async () => {
		vi.mocked(db.accountLockout.findUnique).mockResolvedValue({
			id: "lockout-1",
			userId: "user-123",
			lockedAt: new Date("2024-01-15T09:30:00Z"),
			unlocksAt: new Date("2024-01-15T10:30:00Z"),
			unlockedAt: null,
			unlockedBy: null,
			failedAttempts: 5,
			reason: null,
		});

		const result = await isAccountLocked("user-123");

		expect(result.locked).toBe(true);
		expect(result.lockout).not.toHaveProperty("reason");
	});
});

describe("lockAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("creates a lockout record with correct expiration time", async () => {
		const mockLockout = {
			id: "test-lockout-id",
			userId: "user-123",
			lockedAt: new Date("2024-01-15T10:00:00Z"),
			unlocksAt: new Date("2024-01-15T10:30:00Z"), // 30 minutes later
			failedAttempts: 5,
			reason: "too_many_failed_attempts",
			unlockedAt: null,
			unlockedBy: null,
		};
		vi.mocked(db.accountLockout.upsert).mockResolvedValue(mockLockout);

		const result = await lockAccount(
			"user-123",
			"too_many_failed_attempts",
			5,
		);

		expect(db.accountLockout.upsert).toHaveBeenCalledWith({
			where: { userId: "user-123" },
			create: {
				id: "test-lockout-id",
				userId: "user-123",
				lockedAt: expect.any(Date),
				unlocksAt: expect.any(Date),
				failedAttempts: 5,
				reason: "too_many_failed_attempts",
			},
			update: {
				lockedAt: expect.any(Date),
				unlocksAt: expect.any(Date),
				failedAttempts: 5,
				reason: "too_many_failed_attempts",
				unlockedAt: null,
				unlockedBy: null,
			},
		});

		expect(result).toEqual({
			userId: "user-123",
			lockedAt: mockLockout.lockedAt,
			unlocksAt: mockLockout.unlocksAt,
			failedAttempts: 5,
			reason: "too_many_failed_attempts",
		});
	});

	it("uses default reason when not provided", async () => {
		const mockLockout = {
			id: "test-lockout-id",
			userId: "user-123",
			lockedAt: new Date(),
			unlocksAt: new Date(),
			failedAttempts: 0,
			reason: "too_many_failed_attempts",
			unlockedAt: null,
			unlockedBy: null,
		};
		vi.mocked(db.accountLockout.upsert).mockResolvedValue(mockLockout);

		await lockAccount("user-123");

		expect(db.accountLockout.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					reason: "too_many_failed_attempts",
					failedAttempts: 0,
				}),
			}),
		);
	});

	it("accepts different lockout reasons", async () => {
		const mockLockout = {
			id: "test-lockout-id",
			userId: "user-123",
			lockedAt: new Date(),
			unlocksAt: new Date(),
			failedAttempts: 0,
			reason: "admin_action",
			unlockedAt: null,
			unlockedBy: null,
		};
		vi.mocked(db.accountLockout.upsert).mockResolvedValue(mockLockout);

		const result = await lockAccount("user-123", "admin_action", 0);

		expect(result.reason).toBe("admin_action");
	});

	it("accepts suspicious_activity as reason", async () => {
		const mockLockout = {
			id: "test-lockout-id",
			userId: "user-123",
			lockedAt: new Date(),
			unlocksAt: new Date(),
			failedAttempts: 0,
			reason: "suspicious_activity",
			unlockedAt: null,
			unlockedBy: null,
		};
		vi.mocked(db.accountLockout.upsert).mockResolvedValue(mockLockout);

		const result = await lockAccount("user-123", "suspicious_activity", 0);

		expect(result.reason).toBe("suspicious_activity");
	});

	it("excludes reason from result when reason is null in database", async () => {
		const mockLockout = {
			id: "test-lockout-id",
			userId: "user-123",
			lockedAt: new Date(),
			unlocksAt: new Date(),
			failedAttempts: 0,
			reason: null,
			unlockedAt: null,
			unlockedBy: null,
		};
		vi.mocked(db.accountLockout.upsert).mockResolvedValue(mockLockout);

		const result = await lockAccount("user-123");

		expect(result).not.toHaveProperty("reason");
	});
});

describe("unlockAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("updates the lockout record with unlock details", async () => {
		vi.mocked(db.accountLockout.update).mockResolvedValue({
			id: "lockout-1",
			userId: "user-123",
			lockedAt: new Date(),
			unlocksAt: new Date(),
			unlockedAt: new Date("2024-01-15T10:00:00Z"),
			unlockedBy: "admin-456",
			failedAttempts: 5,
			reason: "too_many_failed_attempts",
		});

		await unlockAccount("user-123", "admin-456");

		expect(db.accountLockout.update).toHaveBeenCalledWith({
			where: { userId: "user-123" },
			data: {
				unlockedAt: expect.any(Date),
				unlockedBy: "admin-456",
			},
		});
	});

	it("records the admin user who unlocked the account", async () => {
		vi.mocked(db.accountLockout.update).mockResolvedValue({
			id: "lockout-1",
			userId: "user-123",
			lockedAt: new Date(),
			unlocksAt: new Date(),
			unlockedAt: new Date(),
			unlockedBy: "super-admin-789",
			failedAttempts: 5,
			reason: null,
		});

		await unlockAccount("user-123", "super-admin-789");

		expect(db.accountLockout.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					unlockedBy: "super-admin-789",
				}),
			}),
		);
	});
});

describe("shouldLockAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns false when account lockout is disabled", async () => {
		mockAccountLockoutConfig.enabled = false;

		const result = await shouldLockAccount("test@example.com");

		expect(result).toBe(false);
		expect(db.loginAttempt.count).not.toHaveBeenCalled();

		// Reset for other tests
		mockAccountLockoutConfig.enabled = true;
	});

	it("returns false when failed attempts are below threshold", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(4); // Below 5

		const result = await shouldLockAccount("test@example.com");

		expect(result).toBe(false);
	});

	it("returns true when failed attempts meet threshold", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(5); // Exactly 5

		const result = await shouldLockAccount("test@example.com");

		expect(result).toBe(true);
	});

	it("returns true when failed attempts exceed threshold", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(10); // Above 5

		const result = await shouldLockAccount("test@example.com");

		expect(result).toBe(true);
	});

	it("only counts failed attempts within the 15-minute window", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(3);

		await shouldLockAccount("test@example.com");

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

	it("returns false when no failed attempts", async () => {
		vi.mocked(db.loginAttempt.count).mockResolvedValue(0);

		const result = await shouldLockAccount("test@example.com");

		expect(result).toBe(false);
	});
});

describe("getLockedAccounts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns all currently locked accounts", async () => {
		const lockout1LockedAt = new Date("2024-01-15T09:30:00Z");
		const lockout1UnlocksAt = new Date("2024-01-15T10:30:00Z");
		const lockout2LockedAt = new Date("2024-01-15T09:45:00Z");
		const lockout2UnlocksAt = new Date("2024-01-15T10:45:00Z");

		const mockLockouts = [
			{
				id: "lockout-1",
				userId: "user-1",
				lockedAt: lockout1LockedAt,
				unlocksAt: lockout1UnlocksAt,
				unlockedAt: null,
				unlockedBy: null,
				reason: "too_many_failed_attempts",
				failedAttempts: 5,
				user: {
					email: "user1@example.com",
					name: "User One",
				},
			},
			{
				id: "lockout-2",
				userId: "user-2",
				lockedAt: lockout2LockedAt,
				unlocksAt: lockout2UnlocksAt,
				unlockedAt: null,
				unlockedBy: null,
				reason: "admin_action",
				failedAttempts: 0,
				user: {
					email: "user2@example.com",
					name: null,
				},
			},
		];
		vi.mocked(db.accountLockout.findMany).mockResolvedValue(
			mockLockouts as any,
		);

		const result = await getLockedAccounts();

		expect(result).toEqual([
			{
				userId: "user-1",
				email: "user1@example.com",
				name: "User One",
				lockedAt: lockout1LockedAt,
				unlocksAt: lockout1UnlocksAt,
				reason: "too_many_failed_attempts",
				failedAttempts: 5,
			},
			{
				userId: "user-2",
				email: "user2@example.com",
				name: null,
				lockedAt: lockout2LockedAt,
				unlocksAt: lockout2UnlocksAt,
				reason: "admin_action",
				failedAttempts: 0,
			},
		]);
	});

	it("only fetches accounts that are not unlocked and not expired", async () => {
		vi.mocked(db.accountLockout.findMany).mockResolvedValue([]);

		await getLockedAccounts();

		expect(db.accountLockout.findMany).toHaveBeenCalledWith({
			where: {
				unlockedAt: null,
				unlocksAt: {
					gt: expect.any(Date),
				},
			},
			include: {
				user: {
					select: {
						email: true,
						name: true,
					},
				},
			},
		});
	});

	it("returns empty array when no accounts are locked", async () => {
		vi.mocked(db.accountLockout.findMany).mockResolvedValue([]);

		const result = await getLockedAccounts();

		expect(result).toEqual([]);
	});
});

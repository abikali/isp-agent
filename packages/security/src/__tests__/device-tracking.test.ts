import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	generateDeviceFingerprint,
	getUserDevices,
	handleDeviceLogin,
	isKnownDevice,
	parseDeviceName,
	registerDevice,
	removeDevice,
	sendNewDeviceNotification,
} from "../device-tracking";

// Create mutable config mock using vi.hoisted to ensure it's available before vi.mock runs
const mockDeviceTrackingConfig = vi.hoisted(() => ({
	enabled: true as boolean,
	notifyNewDevice: false as boolean,
	maxKnownDevices: 10,
}));

// Mock dependencies
vi.mock("@repo/database", () => ({
	db: {
		knownDevice: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn(),
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
			deviceTracking: mockDeviceTrackingConfig,
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("@repo/mail", () => ({
	sendEmail: vi.fn(),
}));

vi.mock("@paralleldrive/cuid2", () => ({
	createId: vi.fn(() => "test-device-id"),
}));

// Import mocked modules after mocking
import { db } from "@repo/database";
import { sendEmail } from "@repo/mail";

// Helper to create mock user with all required Prisma fields
function createMockUser(overrides: {
	id: string;
	email: string;
	name: string;
}) {
	return {
		...overrides,
		emailVerified: true,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		paymentsCustomerId: null,
		role: null,
		username: null,
		banned: null,
		banReason: null,
		banExpires: null,
		onboardingComplete: false,
		locale: null,
		displayUsername: null,
		twoFactorEnabled: null,
		deletionScheduledAt: null,
		deletionReason: null,
	};
}

describe("generateDeviceFingerprint", () => {
	it("generates a SHA256 hash of the user agent", () => {
		const fingerprint = generateDeviceFingerprint({
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		});

		// SHA256 hash truncated to 32 characters
		expect(fingerprint).toHaveLength(32);
		expect(/^[a-f0-9]{32}$/.test(fingerprint)).toBe(true);
	});

	it("generates consistent fingerprints for the same user agent", () => {
		const userAgent = "Mozilla/5.0 Chrome/120.0.0.0";

		const fingerprint1 = generateDeviceFingerprint({ userAgent });
		const fingerprint2 = generateDeviceFingerprint({ userAgent });

		expect(fingerprint1).toBe(fingerprint2);
	});

	it("generates different fingerprints for different user agents", () => {
		const fingerprint1 = generateDeviceFingerprint({
			userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
		});
		const fingerprint2 = generateDeviceFingerprint({
			userAgent: "Mozilla/5.0 Firefox/120.0",
		});

		expect(fingerprint1).not.toBe(fingerprint2);
	});

	it("does not include IP address in fingerprint", () => {
		const fingerprintWithIp = generateDeviceFingerprint({
			userAgent: "Mozilla/5.0 Chrome",
			ipAddress: "192.168.1.1",
		});
		const fingerprintWithoutIp = generateDeviceFingerprint({
			userAgent: "Mozilla/5.0 Chrome",
		});

		// IP address should not affect fingerprint
		expect(fingerprintWithIp).toBe(fingerprintWithoutIp);
	});
});

describe("parseDeviceName", () => {
	it("parses Chrome on Windows", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
		);
		expect(result).toBe("Chrome on Windows");
	});

	it("parses Firefox on Mac", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/120.0",
		);
		expect(result).toBe("Firefox on Mac");
	});

	it("parses Safari on Mac", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36",
		);
		expect(result).toBe("Safari on Mac");
	});

	it("parses Edge on Windows", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0.0.0",
		);
		expect(result).toBe("Edge on Windows");
	});

	it("parses Opera on Linux", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (X11; Linux x86_64) OPR/104.0.0.0",
		);
		expect(result).toBe("Opera on Linux");
	});

	// Note: The current implementation checks OS in order (windows, mac, linux, android, ios)
	// Since Android user agents contain "Linux" and iOS user agents contain "Mac OS",
	// these are detected as their parent OS. A more sophisticated parser would check
	// mobile-specific patterns first.
	it("parses Chrome on Android (detected as Linux due to UA containing 'Linux')", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile",
		);
		expect(result).toBe("Chrome on Linux");
	});

	it("parses Safari on iOS iPhone (detected as Mac due to UA containing 'Mac OS')", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1",
		);
		expect(result).toBe("Safari on Mac");
	});

	it("parses Safari on iOS iPad (detected as Mac due to UA containing 'Mac OS')", () => {
		const result = parseDeviceName(
			"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1",
		);
		expect(result).toBe("Safari on Mac");
	});

	it("returns unknown for unrecognized user agents", () => {
		const result = parseDeviceName("Some Unknown User Agent");
		expect(result).toBe("Unknown Browser on Unknown OS");
	});

	it("handles empty string", () => {
		const result = parseDeviceName("");
		expect(result).toBe("Unknown Browser on Unknown OS");
	});
});

describe("isKnownDevice", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns true when device tracking is disabled", async () => {
		mockDeviceTrackingConfig.enabled = false;

		const result = await isKnownDevice("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(result).toBe(true);
		expect(db.knownDevice.findUnique).not.toHaveBeenCalled();

		// Reset for other tests
		mockDeviceTrackingConfig.enabled = true;
	});

	it("returns true when device is found in database", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue({
			id: "device-1",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome on Windows",
			userAgent: "Mozilla/5.0 Chrome",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});

		const result = await isKnownDevice("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(result).toBe(true);
	});

	it("returns false when device is not found in database", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);

		const result = await isKnownDevice("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(result).toBe(false);
	});

	it("queries by userId and deviceFingerprint composite key", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);

		await isKnownDevice("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(db.knownDevice.findUnique).toHaveBeenCalledWith({
			where: {
				userId_deviceFingerprint: {
					userId: "user-123",
					deviceFingerprint: expect.any(String),
				},
			},
		});
	});
});

describe("registerDevice", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns { isNew: false } when device tracking is disabled", async () => {
		mockDeviceTrackingConfig.enabled = false;

		const result = await registerDevice("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(result).toEqual({ isNew: false, deviceId: "" });
		expect(db.knownDevice.findUnique).not.toHaveBeenCalled();

		// Reset for other tests
		mockDeviceTrackingConfig.enabled = true;
	});

	it("updates lastSeenAt for existing device", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue({
			id: "existing-device",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome on Windows",
			userAgent: "Mozilla/5.0 Chrome",
			ipAddress: null,
			lastSeenAt: new Date("2024-01-01"),
			createdAt: new Date("2024-01-01"),
		});
		vi.mocked(db.knownDevice.update).mockResolvedValue({
			id: "existing-device",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome on Windows",
			userAgent: "Mozilla/5.0 Chrome",
			ipAddress: "192.168.1.1",
			lastSeenAt: new Date(),
			createdAt: new Date("2024-01-01"),
		});

		const result = await registerDevice("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
			ipAddress: "192.168.1.1",
		});

		expect(result).toEqual({ isNew: false, deviceId: "existing-device" });
		expect(db.knownDevice.update).toHaveBeenCalledWith({
			where: { id: "existing-device" },
			data: {
				lastSeenAt: expect.any(Date),
				ipAddress: "192.168.1.1",
			},
		});
	});

	it("creates new device when not existing", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);
		vi.mocked(db.knownDevice.count).mockResolvedValue(0);
		vi.mocked(db.knownDevice.create).mockResolvedValue({
			id: "test-device-id",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome on Windows",
			userAgent: "Mozilla/5.0 (Windows) Chrome",
			ipAddress: "192.168.1.1",
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});

		const result = await registerDevice("user-123", {
			userAgent: "Mozilla/5.0 (Windows) Chrome",
			ipAddress: "192.168.1.1",
		});

		expect(result).toEqual({ isNew: true, deviceId: "test-device-id" });
		expect(db.knownDevice.create).toHaveBeenCalledWith({
			data: {
				id: "test-device-id",
				userId: "user-123",
				deviceFingerprint: expect.any(String),
				deviceName: "Chrome on Windows",
				userAgent: "Mozilla/5.0 (Windows) Chrome",
				ipAddress: "192.168.1.1",
			},
		});
	});

	it("removes oldest device when max devices limit is reached", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);
		vi.mocked(db.knownDevice.count).mockResolvedValue(10); // At max limit
		vi.mocked(db.knownDevice.findFirst).mockResolvedValue({
			id: "oldest-device",
			userId: "user-123",
			deviceFingerprint: "old123",
			deviceName: "Old Browser",
			userAgent: "Old User Agent",
			ipAddress: null,
			lastSeenAt: new Date("2023-01-01"),
			createdAt: new Date("2023-01-01"),
		});
		vi.mocked(db.knownDevice.delete).mockResolvedValue({
			id: "oldest-device",
			userId: "user-123",
			deviceFingerprint: "old123",
			deviceName: "Old Browser",
			userAgent: "Old User Agent",
			ipAddress: null,
			lastSeenAt: new Date("2023-01-01"),
			createdAt: new Date("2023-01-01"),
		});
		vi.mocked(db.knownDevice.create).mockResolvedValue({
			id: "test-device-id",
			userId: "user-123",
			deviceFingerprint: "new123",
			deviceName: "New Browser",
			userAgent: "New User Agent",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});

		await registerDevice("user-123", {
			userAgent: "New User Agent",
		});

		expect(db.knownDevice.findFirst).toHaveBeenCalledWith({
			where: { userId: "user-123" },
			orderBy: { lastSeenAt: "asc" },
		});
		expect(db.knownDevice.delete).toHaveBeenCalledWith({
			where: { id: "oldest-device" },
		});
	});

	it("does not delete when under max devices limit", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);
		vi.mocked(db.knownDevice.count).mockResolvedValue(5); // Under limit
		vi.mocked(db.knownDevice.create).mockResolvedValue({
			id: "test-device-id",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome",
			userAgent: "Mozilla",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});

		await registerDevice("user-123", {
			userAgent: "Mozilla",
		});

		expect(db.knownDevice.findFirst).not.toHaveBeenCalled();
		expect(db.knownDevice.delete).not.toHaveBeenCalled();
	});

	it("handles null ipAddress", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);
		vi.mocked(db.knownDevice.count).mockResolvedValue(0);
		vi.mocked(db.knownDevice.create).mockResolvedValue({
			id: "test-device-id",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome",
			userAgent: "Mozilla",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});

		await registerDevice("user-123", {
			userAgent: "Mozilla",
		});

		expect(db.knownDevice.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				ipAddress: null,
			}),
		});
	});
});

describe("sendNewDeviceNotification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when notifications are disabled", async () => {
		mockDeviceTrackingConfig.notifyNewDevice = false;

		await sendNewDeviceNotification("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(db.user.findUnique).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();

		// Reset for other tests - keep disabled for most tests
	});

	it("does nothing when user is not found", async () => {
		mockDeviceTrackingConfig.notifyNewDevice = true;
		vi.mocked(db.user.findUnique).mockResolvedValue(null);

		await sendNewDeviceNotification("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(sendEmail).not.toHaveBeenCalled();

		// Reset
		mockDeviceTrackingConfig.notifyNewDevice = false;
	});

	it("sends email notification for new device", async () => {
		mockDeviceTrackingConfig.notifyNewDevice = true;
		vi.mocked(db.user.findUnique).mockResolvedValue(
			createMockUser({
				id: "user-123",
				email: "test@example.com",
				name: "John Doe",
			}),
		);

		await sendNewDeviceNotification("user-123", {
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
			ipAddress: "192.168.1.1",
		});

		expect(sendEmail).toHaveBeenCalledWith({
			to: "test@example.com",
			subject: "New device login detected",
			html: expect.stringContaining("Hi John Doe"),
		});
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				html: expect.stringContaining("Chrome on Windows"),
			}),
		);

		// Reset
		mockDeviceTrackingConfig.notifyNewDevice = false;
	});

	it("handles missing name gracefully", async () => {
		mockDeviceTrackingConfig.notifyNewDevice = true;
		// For the "Hi there" fallback, we need to return a user without a name,
		// but Prisma schema requires name. Use type assertion to test edge case.
		vi.mocked(db.user.findUnique).mockResolvedValue({
			...createMockUser({
				id: "user-123",
				email: "test@example.com",
				name: "",
			}),
			name: null as unknown as string,
		});

		await sendNewDeviceNotification("user-123", {
			userAgent: "Mozilla/5.0 Chrome",
		});

		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				html: expect.stringContaining("Hi there"),
			}),
		);

		// Reset
		mockDeviceTrackingConfig.notifyNewDevice = false;
	});

	it("does not throw when email sending fails", async () => {
		mockDeviceTrackingConfig.notifyNewDevice = true;
		vi.mocked(db.user.findUnique).mockResolvedValue(
			createMockUser({
				id: "user-123",
				email: "test@example.com",
				name: "John",
			}),
		);
		vi.mocked(sendEmail).mockRejectedValue(new Error("Email failed"));

		// Should not throw
		await expect(
			sendNewDeviceNotification("user-123", {
				userAgent: "Mozilla/5.0 Chrome",
			}),
		).resolves.toBeUndefined();

		// Reset
		mockDeviceTrackingConfig.notifyNewDevice = false;
	});
});

describe("getUserDevices", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns all devices for a user ordered by lastSeenAt", async () => {
		const mockDevices = [
			{
				id: "device-1",
				userId: "user-123",
				deviceFingerprint: "fingerprint-1",
				deviceName: "Chrome on Windows",
				userAgent: "Mozilla/5.0 Chrome",
				ipAddress: "192.168.1.1",
				lastSeenAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-01T10:00:00Z"),
			},
			{
				id: "device-2",
				userId: "user-123",
				deviceFingerprint: "fingerprint-2",
				deviceName: "Safari on Mac",
				userAgent: "Mozilla/5.0 Safari",
				ipAddress: null,
				lastSeenAt: new Date("2024-01-10T10:00:00Z"),
				createdAt: new Date("2024-01-01T09:00:00Z"),
			},
		];
		vi.mocked(db.knownDevice.findMany).mockResolvedValue(mockDevices);

		const result = await getUserDevices("user-123");

		expect(result).toEqual(mockDevices);
		expect(db.knownDevice.findMany).toHaveBeenCalledWith({
			where: { userId: "user-123" },
			orderBy: { lastSeenAt: "desc" },
			select: {
				id: true,
				deviceName: true,
				userAgent: true,
				ipAddress: true,
				lastSeenAt: true,
				createdAt: true,
			},
		});
	});

	it("returns empty array when user has no devices", async () => {
		vi.mocked(db.knownDevice.findMany).mockResolvedValue([]);

		const result = await getUserDevices("user-123");

		expect(result).toEqual([]);
	});
});

describe("removeDevice", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deletes the device ensuring user ownership", async () => {
		vi.mocked(db.knownDevice.deleteMany).mockResolvedValue({ count: 1 });

		await removeDevice("user-123", "device-456");

		expect(db.knownDevice.deleteMany).toHaveBeenCalledWith({
			where: {
				id: "device-456",
				userId: "user-123",
			},
		});
	});

	it("does not throw when device does not exist", async () => {
		vi.mocked(db.knownDevice.deleteMany).mockResolvedValue({ count: 0 });

		await expect(
			removeDevice("user-123", "non-existent"),
		).resolves.toBeUndefined();
	});
});

describe("handleDeviceLogin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers device and sends notification for new device", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue(null);
		vi.mocked(db.knownDevice.count).mockResolvedValue(0);
		vi.mocked(db.knownDevice.create).mockResolvedValue({
			id: "new-device-id",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome",
			userAgent: "Mozilla",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});
		mockDeviceTrackingConfig.notifyNewDevice = true;
		vi.mocked(db.user.findUnique).mockResolvedValue(
			createMockUser({
				id: "user-123",
				email: "test@example.com",
				name: "John",
			}),
		);

		await handleDeviceLogin("user-123", {
			userAgent: "Mozilla",
		});

		expect(db.knownDevice.create).toHaveBeenCalled();
		expect(sendEmail).toHaveBeenCalled();

		// Reset
		mockDeviceTrackingConfig.notifyNewDevice = false;
	});

	it("does not send notification for existing device", async () => {
		vi.mocked(db.knownDevice.findUnique).mockResolvedValue({
			id: "existing-device",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome",
			userAgent: "Mozilla",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});
		vi.mocked(db.knownDevice.update).mockResolvedValue({
			id: "existing-device",
			userId: "user-123",
			deviceFingerprint: "abc123",
			deviceName: "Chrome",
			userAgent: "Mozilla",
			ipAddress: null,
			lastSeenAt: new Date(),
			createdAt: new Date(),
		});

		await handleDeviceLogin("user-123", {
			userAgent: "Mozilla",
		});

		expect(sendEmail).not.toHaveBeenCalled();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey } from "../lib/hash";
import { hasPermission, verifyApiKey } from "../lib/verify";

// Mock the database module
vi.mock("@repo/database", () => ({
	db: {
		apiKey: {
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}));

import { db } from "@repo/database";

const mockFindUnique = vi.mocked(db.apiKey.findUnique);
const mockUpdate = vi.mocked(db.apiKey.update);

describe("verifyApiKey", () => {
	const mockApiKeyData = {
		id: "key-123",
		name: "Test API Key",
		organizationId: "org-456",
		permissions: ["read:users", "write:members"],
		expiresAt: null,
		revokedAt: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdate.mockResolvedValue({} as any);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("returns valid=false for invalid key format", async () => {
		const result = await verifyApiKey("invalid-key-format");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid API key format");
		expect(mockFindUnique).not.toHaveBeenCalled();
	});

	it("returns valid=false for key with wrong prefix", async () => {
		const result = await verifyApiKey(
			"wrong_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl",
		);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid API key format");
	});

	it("returns valid=false for key not found in database", async () => {
		const { plainKey } = generateApiKey();
		mockFindUnique.mockResolvedValue(null);

		const result = await verifyApiKey(plainKey);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("API key not found");
	});

	it("returns valid=false for revoked key", async () => {
		const { plainKey, keyHash } = generateApiKey();
		mockFindUnique.mockResolvedValue({
			...mockApiKeyData,
			revokedAt: new Date("2024-01-01"),
		} as any);

		const result = await verifyApiKey(plainKey);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("API key has been revoked");
		expect(mockFindUnique).toHaveBeenCalledWith({
			where: { keyHash },
			select: expect.any(Object),
		});
	});

	it("returns valid=false for expired key", async () => {
		const { plainKey } = generateApiKey();
		mockFindUnique.mockResolvedValue({
			...mockApiKeyData,
			expiresAt: new Date("2020-01-01"), // Past date
		} as any);

		const result = await verifyApiKey(plainKey);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("API key has expired");
	});

	it("returns valid=true for valid, non-expired, non-revoked key", async () => {
		const { plainKey, keyHash } = generateApiKey();
		mockFindUnique.mockResolvedValue(mockApiKeyData as any);

		const result = await verifyApiKey(plainKey);

		expect(result.valid).toBe(true);
		expect(result.apiKey).toEqual({
			id: mockApiKeyData.id,
			name: mockApiKeyData.name,
			organizationId: mockApiKeyData.organizationId,
			permissions: mockApiKeyData.permissions,
		});
		expect(mockFindUnique).toHaveBeenCalledWith({
			where: { keyHash },
			select: {
				id: true,
				name: true,
				organizationId: true,
				permissions: true,
				expiresAt: true,
				revokedAt: true,
			},
		});
	});

	it("returns valid=true for key with future expiration date", async () => {
		const { plainKey } = generateApiKey();
		const futureDate = new Date();
		futureDate.setFullYear(futureDate.getFullYear() + 1);

		mockFindUnique.mockResolvedValue({
			...mockApiKeyData,
			expiresAt: futureDate,
		} as any);

		const result = await verifyApiKey(plainKey);

		expect(result.valid).toBe(true);
	});

	it("updates lastUsedAt timestamp on successful verification", async () => {
		const { plainKey } = generateApiKey();
		mockFindUnique.mockResolvedValue(mockApiKeyData as any);

		await verifyApiKey(plainKey);

		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: mockApiKeyData.id },
			data: { lastUsedAt: expect.any(Date) },
		});
	});

	it("does not throw if lastUsedAt update fails", async () => {
		const { plainKey } = generateApiKey();
		mockFindUnique.mockResolvedValue(mockApiKeyData as any);
		mockUpdate.mockRejectedValue(new Error("Update failed"));

		// Should not throw
		const result = await verifyApiKey(plainKey);

		expect(result.valid).toBe(true);
	});

	it("correctly hashes the key for database lookup", async () => {
		const { plainKey, keyHash } = generateApiKey();
		mockFindUnique.mockResolvedValue(null);

		await verifyApiKey(plainKey);

		expect(mockFindUnique).toHaveBeenCalledWith({
			where: { keyHash },
			select: expect.any(Object),
		});
	});
});

describe("hasPermission", () => {
	describe("exact permission matching", () => {
		it("returns true when permissions include exact match", () => {
			const permissions = ["read:users", "write:members"];

			expect(hasPermission(permissions, "read:users")).toBe(true);
			expect(hasPermission(permissions, "write:members")).toBe(true);
		});

		it("returns false when permissions do not include the required permission", () => {
			const permissions = ["read:users"];

			expect(hasPermission(permissions, "write:users")).toBe(false);
			expect(hasPermission(permissions, "read:members")).toBe(false);
		});
	});

	describe("wildcard * permission", () => {
		it("returns true for any permission when * is present", () => {
			const permissions = ["*"];

			expect(hasPermission(permissions, "read:users")).toBe(true);
			expect(hasPermission(permissions, "write:organization")).toBe(true);
			expect(hasPermission(permissions, "delete:everything")).toBe(true);
		});

		it("returns true when * is among other permissions", () => {
			const permissions = ["read:users", "*", "write:members"];

			expect(hasPermission(permissions, "admin:all")).toBe(true);
		});
	});

	describe("prefix wildcard patterns (read:*, write:*)", () => {
		it("returns true for read:* matching any read permission", () => {
			const permissions = ["read:*"];

			expect(hasPermission(permissions, "read:users")).toBe(true);
			expect(hasPermission(permissions, "read:members")).toBe(true);
			expect(hasPermission(permissions, "read:organization")).toBe(true);
		});

		it("returns true for write:* matching any write permission", () => {
			const permissions = ["write:*"];

			expect(hasPermission(permissions, "write:users")).toBe(true);
			expect(hasPermission(permissions, "write:members")).toBe(true);
		});

		it("returns false for write:* when checking read permission", () => {
			const permissions = ["write:*"];

			expect(hasPermission(permissions, "read:users")).toBe(false);
		});

		it("returns false for read:* when checking write permission", () => {
			const permissions = ["read:*"];

			expect(hasPermission(permissions, "write:users")).toBe(false);
		});
	});

	describe("combined permissions", () => {
		it("handles multiple wildcard patterns correctly", () => {
			const permissions = ["read:*", "write:members"];

			expect(hasPermission(permissions, "read:users")).toBe(true);
			expect(hasPermission(permissions, "read:organization")).toBe(true);
			expect(hasPermission(permissions, "write:members")).toBe(true);
			expect(hasPermission(permissions, "write:users")).toBe(false);
		});

		it("prioritizes exact match over wildcard", () => {
			const permissions = ["read:users"];

			// Should work with exact match
			expect(hasPermission(permissions, "read:users")).toBe(true);
			// Should not match other read permissions
			expect(hasPermission(permissions, "read:members")).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("returns false for empty permissions array", () => {
			expect(hasPermission([], "read:users")).toBe(false);
		});

		it("handles permission without colon", () => {
			const permissions = ["admin"];

			expect(hasPermission(permissions, "admin")).toBe(true);
			expect(hasPermission(permissions, "admin:users")).toBe(false);
		});

		it("handles required permission without colon correctly", () => {
			const permissions = ["read:*"];

			// "admin" has no colon, so [action, resource] split results in undefined resource
			expect(hasPermission(permissions, "admin")).toBe(false);
		});

		it("is case-sensitive for permission matching", () => {
			const permissions = ["Read:Users"];

			expect(hasPermission(permissions, "read:users")).toBe(false);
			expect(hasPermission(permissions, "Read:Users")).toBe(true);
		});
	});
});

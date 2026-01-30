import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module
vi.mock("@repo/database", () => ({
	db: {
		apiKey: {
			create: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
		auditLog: {
			create: vi.fn(),
		},
	},
	getOrganizationById: vi.fn(),
}));

// Mock the membership verification
vi.mock("@repo/api/lib/membership", () => ({
	verifyOrganizationMembership: vi.fn(),
	checkOrganizationAdmin: vi.fn(),
}));

// Mock permission functions
vi.mock("@repo/api/lib/permission", () => ({
	getPermissionContext: vi.fn((userId, orgId, role) => ({
		userId,
		organizationId: orgId,
		memberRole: role,
	})),
	getOwnershipFilter: vi.fn(),
}));

// Mock the hash module - use literal values since mocks are hoisted
// Valid key format: libancom_ (6 chars) + 43 base64url chars = 49 chars total
vi.mock("../lib/hash", () => ({
	generateApiKey: () => ({
		plainKey: "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq",
		keyHash:
			"mockedhash123456789abcdef0123456789abcdef0123456789abcdef01234567",
		keyPrefix: "libancom_ABCDEFGH",
	}),
}));

// Constants for tests (must match mock values)
const MOCK_PLAIN_KEY = "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
const MOCK_KEY_HASH =
	"mockedhash123456789abcdef0123456789abcdef0123456789abcdef01234567";
const MOCK_KEY_PREFIX = "libancom_ABCDEFGH";

import {
	checkOrganizationAdmin,
	verifyOrganizationMembership,
} from "@repo/api/lib/membership";
import { getOwnershipFilter } from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";

const mockDb = vi.mocked(db);
const mockGetOrganizationById = vi.mocked(getOrganizationById);
const mockVerifyMembership = vi.mocked(verifyOrganizationMembership);
const mockCheckAdmin = vi.mocked(checkOrganizationAdmin);
const mockGetOwnershipFilter = vi.mocked(getOwnershipFilter);

// Import handlers after mocking
import { createApiKey } from "../procedures/create";
import { listApiKeys } from "../procedures/list";
import { revokeApiKey } from "../procedures/revoke";

describe("API Key Procedures", () => {
	const mockUser = { id: "user-123", email: "test@example.com" };
	const mockOrganization = {
		id: "org-456",
		name: "Test Org",
		slug: "test-org",
	};
	const mockContext = { user: mockUser, headers: new Headers() };

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("createApiKey", () => {
		const validInput = {
			organizationId: "org-456",
			name: "My API Key",
			permissions: ["read:users", "write:members"],
		};

		it("creates an API key when user is admin", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockCheckAdmin.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockDb.apiKey.create.mockResolvedValue({
				id: "key-789",
				name: validInput.name,
				keyPrefix: "libancom_MockedAP",
				permissions: validInput.permissions,
				expiresAt: null,
				createdAt: new Date(),
			} as any);

			const handler = createApiKey["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result).toHaveProperty("id", "key-789");
			expect(result).toHaveProperty("key", MOCK_PLAIN_KEY);
			expect(result).toHaveProperty("name", validInput.name);
			expect(mockDb.apiKey.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					name: validInput.name,
					keyHash: MOCK_KEY_HASH,
					keyPrefix: MOCK_KEY_PREFIX,
					organizationId: validInput.organizationId,
					createdById: mockUser.id,
					permissions: validInput.permissions,
				}),
				select: expect.any(Object),
			});
		});

		it("creates an API key when user is owner", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockCheckAdmin.mockResolvedValue({
				organization: mockOrganization,
				role: "owner",
			});
			mockDb.apiKey.create.mockResolvedValue({
				id: "key-789",
				name: validInput.name,
				keyPrefix: "libancom_MockedAP",
				permissions: validInput.permissions,
				expiresAt: null,
				createdAt: new Date(),
			} as any);

			const handler = createApiKey["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result).toHaveProperty("id");
			expect(result).toHaveProperty("key");
			expect(mockDb.apiKey.create).toHaveBeenCalled();
		});

		it("throws FORBIDDEN when user is a member but not admin/owner", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockCheckAdmin.mockResolvedValue(null);

			const handler = createApiKey["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("Only organization admins can create API keys");
		});

		it("throws FORBIDDEN when user is not a member", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockCheckAdmin.mockResolvedValue(null);

			const handler = createApiKey["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("Only organization admins can create API keys");
		});

		it("throws BAD_REQUEST when organization does not exist", async () => {
			mockGetOrganizationById.mockResolvedValue(null);

			const handler = createApiKey["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("Organization not found");
		});

		it("creates an API key with expiration date", async () => {
			const expirationDate = new Date();
			expirationDate.setFullYear(expirationDate.getFullYear() + 1);
			const inputWithExpiration = {
				...validInput,
				expiresAt: expirationDate.toISOString(),
			};

			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockCheckAdmin.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockDb.apiKey.create.mockResolvedValue({
				id: "key-789",
				name: validInput.name,
				keyPrefix: "libancom_MockedAP",
				permissions: validInput.permissions,
				expiresAt: expirationDate,
				createdAt: new Date(),
			} as any);

			const handler = createApiKey["~orpc"].handler;
			await handler({
				context: mockContext,
				input: inputWithExpiration,
			} as any);

			expect(mockDb.apiKey.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					expiresAt: expect.any(Date),
				}),
				select: expect.any(Object),
			});
		});

		it("stores createdById to track key creator", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockCheckAdmin.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockDb.apiKey.create.mockResolvedValue({
				id: "key-789",
				name: validInput.name,
				keyPrefix: "libancom_MockedAP",
				permissions: validInput.permissions,
				expiresAt: null,
				createdAt: new Date(),
			} as any);

			const handler = createApiKey["~orpc"].handler;
			await handler({ context: mockContext, input: validInput } as any);

			expect(mockDb.apiKey.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					createdById: mockUser.id,
				}),
				select: expect.any(Object),
			});
		});
	});

	describe("listApiKeys", () => {
		const validInput = { organizationId: "org-456" };

		it("returns API keys for organization admins", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockGetOwnershipFilter.mockReturnValue(undefined); // Admin sees all
			mockDb.apiKey.findMany.mockResolvedValue([
				{
					id: "key-1",
					name: "API Key 1",
					keyPrefix: "libancom_key1...",
					permissions: ["read:users"],
					expiresAt: null,
					lastUsedAt: new Date(),
					createdAt: new Date(),
					user: {
						id: "user-123",
						name: "Test User",
						email: "test@example.com",
					},
				},
			] as any);

			const handler = listApiKeys["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result.apiKeys).toHaveLength(1);
			expect(result.apiKeys[0]).toHaveProperty("id", "key-1");
			expect(result.apiKeys[0]).toHaveProperty("user");
		});

		it("returns API keys for organization owners", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "owner",
			});
			mockGetOwnershipFilter.mockReturnValue(undefined); // Owner sees all
			mockDb.apiKey.findMany.mockResolvedValue([]);

			const handler = listApiKeys["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result.apiKeys).toEqual([]);
		});

		it("returns only own API keys for regular member", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Member gets ownership filter applied
			mockGetOwnershipFilter.mockReturnValue({
				createdById: mockUser.id,
			});
			mockDb.apiKey.findMany.mockResolvedValue([]);

			const handler = listApiKeys["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result.apiKeys).toEqual([]);
			// Verify ownership filter was applied
			expect(mockDb.apiKey.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						createdById: mockUser.id,
					}),
				}),
			);
		});

		it("throws FORBIDDEN when user is not a member", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue(null);

			const handler = listApiKeys["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("You must be a member of this organization");
		});

		it("only returns non-revoked keys", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockGetOwnershipFilter.mockReturnValue(undefined);
			mockDb.apiKey.findMany.mockResolvedValue([]);

			const handler = listApiKeys["~orpc"].handler;
			await handler({ context: mockContext, input: validInput } as any);

			expect(mockDb.apiKey.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						revokedAt: null,
					}),
				}),
			);
		});

		it("orders API keys by creation date descending", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockGetOwnershipFilter.mockReturnValue(undefined);
			mockDb.apiKey.findMany.mockResolvedValue([]);

			const handler = listApiKeys["~orpc"].handler;
			await handler({ context: mockContext, input: validInput } as any);

			expect(mockDb.apiKey.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					orderBy: { createdAt: "desc" },
				}),
			);
		});

		it("includes user relation in response", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockGetOwnershipFilter.mockReturnValue(undefined);
			mockDb.apiKey.findMany.mockResolvedValue([]);

			const handler = listApiKeys["~orpc"].handler;
			await handler({ context: mockContext, input: validInput } as any);

			expect(mockDb.apiKey.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					select: expect.objectContaining({
						user: expect.any(Object),
					}),
				}),
			);
		});
	});

	describe("revokeApiKey", () => {
		const keyId = "key-789";

		it("revokes an API key when user is admin", async () => {
			mockDb.apiKey.findUnique.mockResolvedValue({
				id: keyId,
				organizationId: "org-456",
				revokedAt: null,
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockDb.apiKey.update.mockResolvedValue({} as any);

			const handler = revokeApiKey["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { id: keyId },
			} as any);

			expect(result).toEqual({ success: true });
			expect(mockDb.apiKey.update).toHaveBeenCalledWith({
				where: { id: keyId },
				data: { revokedAt: expect.any(Date) },
			});
		});

		it("revokes an API key when user is owner", async () => {
			mockDb.apiKey.findUnique.mockResolvedValue({
				id: keyId,
				organizationId: "org-456",
				revokedAt: null,
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "owner",
			});
			mockDb.apiKey.update.mockResolvedValue({} as any);

			const handler = revokeApiKey["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { id: keyId },
			} as any);

			expect(result).toEqual({ success: true });
		});

		it("throws NOT_FOUND when API key does not exist", async () => {
			mockDb.apiKey.findUnique.mockResolvedValue(null);

			const handler = revokeApiKey["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: keyId },
				} as any),
			).rejects.toThrow("API key not found");
		});

		it("throws BAD_REQUEST when API key is already revoked", async () => {
			mockDb.apiKey.findUnique.mockResolvedValue({
				id: keyId,
				organizationId: "org-456",
				revokedAt: new Date("2024-01-01"), // Already revoked
			} as any);

			const handler = revokeApiKey["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: keyId },
				} as any),
			).rejects.toThrow("API key is already revoked");
		});

		it("throws FORBIDDEN when user is a regular member", async () => {
			mockDb.apiKey.findUnique.mockResolvedValue({
				id: keyId,
				organizationId: "org-456",
				revokedAt: null,
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});

			const handler = revokeApiKey["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: keyId },
				} as any),
			).rejects.toThrow("Only organization admins can revoke API keys");
		});

		it("throws FORBIDDEN when user is not a member", async () => {
			mockDb.apiKey.findUnique.mockResolvedValue({
				id: keyId,
				organizationId: "org-456",
				revokedAt: null,
			} as any);
			mockVerifyMembership.mockResolvedValue(null);

			const handler = revokeApiKey["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: keyId },
				} as any),
			).rejects.toThrow(); // Just verify it throws
		});

		it("sets revokedAt to current date/time", async () => {
			const beforeRevoke = new Date();

			mockDb.apiKey.findUnique.mockResolvedValue({
				id: keyId,
				organizationId: "org-456",
				revokedAt: null,
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockDb.apiKey.update.mockResolvedValue({} as any);

			const handler = revokeApiKey["~orpc"].handler;
			await handler({
				context: mockContext,
				input: { id: keyId },
			} as any);

			const afterRevoke = new Date();

			expect(mockDb.apiKey.update).toHaveBeenCalledWith({
				where: { id: keyId },
				data: {
					revokedAt: expect.any(Date),
				},
			});

			// Verify the date is reasonable (between before and after)
			const callArgs = mockDb.apiKey.update.mock.calls[0]?.[0];
			const revokedAt = callArgs?.data?.revokedAt as Date;
			expect(revokedAt.getTime()).toBeGreaterThanOrEqual(
				beforeRevoke.getTime(),
			);
			expect(revokedAt.getTime()).toBeLessThanOrEqual(
				afterRevoke.getTime(),
			);
		});
	});
});

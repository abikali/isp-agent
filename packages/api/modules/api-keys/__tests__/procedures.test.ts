import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		apiKey: {
			create: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
	getOrganizationById: vi.fn(),
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(),
	getOwnershipFilterAsync: vi.fn(),
}));

vi.mock("@repo/auth/lib/audit", () => ({
	apiKeyAudit: {
		created: vi.fn(),
		revoked: vi.fn(),
	},
	getAuditContextFromHeaders: vi.fn(() => ({})),
}));

const MOCK_PLAIN_KEY = "libancom_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
const MOCK_KEY_HASH =
	"mockedhash123456789abcdef0123456789abcdef0123456789abcdef01234567";
const MOCK_KEY_PREFIX = "libancom_ABCDEFGH";

vi.mock("../lib/hash", () => ({
	generateApiKey: () => ({
		plainKey: MOCK_PLAIN_KEY,
		keyHash: MOCK_KEY_HASH,
		keyPrefix: MOCK_KEY_PREFIX,
	}),
}));

import {
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";
import { createApiKey } from "../procedures/create";
import { listApiKeys } from "../procedures/list";
import { revokeApiKey } from "../procedures/revoke";

const mockDb = vi.mocked(db);
const mockRequirePermission = vi.mocked(requirePermission);
const mockGetOwnershipFilter = vi.mocked(getOwnershipFilterAsync);
const mockGetOrganizationById = vi.mocked(getOrganizationById);

const user = { id: "user-1", email: "u@example.com" };
const orgId = "org-1";
const headers = new Headers();
const ctx = { user, headers };

const ALLOW_PERMISSION = {
	member: { role: "owner" } as never,
	permCtx: {
		userId: user.id,
		organizationId: orgId,
		memberRole: "owner",
	} as never,
	activeDealerId: null,
};

const FORBIDDEN = new ORPCError("FORBIDDEN", { message: "denied" });

beforeEach(() => {
	vi.clearAllMocks();
});

async function call<T>(
	procedure: { "~orpc": { handler: (args: unknown) => Promise<T> } },
	input: unknown,
): Promise<T> {
	return procedure["~orpc"].handler({ context: ctx, input });
}

describe("createApiKey", () => {
	const validInput = {
		organizationId: orgId,
		name: "Key",
		permissions: [{ resource: "apiKeys", actions: ["read"] }],
	};

	it("creates a key when permission allows", async () => {
		mockGetOrganizationById.mockResolvedValue({ id: orgId } as never);
		mockRequirePermission.mockResolvedValue(ALLOW_PERMISSION);
		mockDb.apiKey.create.mockResolvedValue({
			id: "key-1",
			name: "Key",
			keyPrefix: MOCK_KEY_PREFIX,
			permissions: validInput.permissions,
			expiresAt: null,
			createdAt: new Date(),
		} as never);

		const result = await call(createApiKey, validInput);

		expect(result.key).toBe(MOCK_PLAIN_KEY);
		expect(result.keyPrefix).toBe(MOCK_KEY_PREFIX);
		expect(mockRequirePermission).toHaveBeenCalledWith(
			orgId,
			user.id,
			"apiKeys",
			"create",
		);
		expect(mockDb.apiKey.create).toHaveBeenCalled();
	});

	it("throws BAD_REQUEST when organization is missing", async () => {
		mockGetOrganizationById.mockResolvedValue(null);

		await expect(call(createApiKey, validInput)).rejects.toThrow(ORPCError);
		expect(mockRequirePermission).not.toHaveBeenCalled();
	});

	it("propagates FORBIDDEN from requirePermission", async () => {
		mockGetOrganizationById.mockResolvedValue({ id: orgId } as never);
		mockRequirePermission.mockRejectedValue(FORBIDDEN);

		await expect(call(createApiKey, validInput)).rejects.toBe(FORBIDDEN);
		expect(mockDb.apiKey.create).not.toHaveBeenCalled();
	});

	it("stores expiresAt when provided", async () => {
		mockGetOrganizationById.mockResolvedValue({ id: orgId } as never);
		mockRequirePermission.mockResolvedValue(ALLOW_PERMISSION);
		mockDb.apiKey.create.mockResolvedValue({
			id: "key-1",
			name: "Key",
			keyPrefix: MOCK_KEY_PREFIX,
			permissions: validInput.permissions,
			expiresAt: new Date("2030-01-01T00:00:00.000Z"),
			createdAt: new Date(),
		} as never);

		await call(createApiKey, {
			...validInput,
			expiresAt: "2030-01-01T00:00:00.000Z",
		});

		const createArgs = mockDb.apiKey.create.mock.calls[0]?.[0] as {
			data: { expiresAt: Date | null };
		};
		expect(createArgs.data.expiresAt).toEqual(
			new Date("2030-01-01T00:00:00.000Z"),
		);
	});
});

describe("listApiKeys", () => {
	it("returns keys filtered by ownership scope", async () => {
		mockGetOrganizationById.mockResolvedValue({ id: orgId } as never);
		mockRequirePermission.mockResolvedValue(ALLOW_PERMISSION);
		mockGetOwnershipFilter.mockResolvedValue({ createdById: user.id });
		mockDb.apiKey.findMany.mockResolvedValue([
			{ id: "k1", name: "K1" } as never,
		]);

		const result = await call(listApiKeys, { organizationId: orgId });

		expect(result.apiKeys).toHaveLength(1);
		const findArgs = mockDb.apiKey.findMany.mock.calls[0]?.[0] as {
			where: Record<string, unknown>;
		};
		expect(findArgs.where).toMatchObject({
			organizationId: orgId,
			revokedAt: null,
			createdById: user.id,
		});
	});

	it("throws BAD_REQUEST when organization is missing", async () => {
		mockGetOrganizationById.mockResolvedValue(null);

		await expect(
			call(listApiKeys, { organizationId: orgId }),
		).rejects.toThrow(ORPCError);
		expect(mockRequirePermission).not.toHaveBeenCalled();
	});
});

describe("revokeApiKey", () => {
	it("sets revokedAt when permitted", async () => {
		mockDb.apiKey.findUnique.mockResolvedValue({
			id: "key-1",
			name: "Key",
			organizationId: orgId,
			revokedAt: null,
		} as never);
		mockRequirePermission.mockResolvedValue(ALLOW_PERMISSION);
		mockDb.apiKey.update.mockResolvedValue({} as never);

		await call(revokeApiKey, { id: "key-1" });

		const updateArgs = mockDb.apiKey.update.mock.calls[0]?.[0] as {
			data: { revokedAt: Date };
		};
		expect(updateArgs.data.revokedAt).toBeInstanceOf(Date);
		expect(mockRequirePermission).toHaveBeenCalledWith(
			orgId,
			user.id,
			"apiKeys",
			"delete",
		);
	});

	it("throws NOT_FOUND when key does not exist", async () => {
		mockDb.apiKey.findUnique.mockResolvedValue(null);

		await expect(call(revokeApiKey, { id: "missing" })).rejects.toThrow(
			ORPCError,
		);
	});

	it("rejects an already-revoked key", async () => {
		mockDb.apiKey.findUnique.mockResolvedValue({
			id: "key-1",
			organizationId: orgId,
			revokedAt: new Date(),
		} as never);

		await expect(call(revokeApiKey, { id: "key-1" })).rejects.toThrow(
			ORPCError,
		);
		expect(mockRequirePermission).not.toHaveBeenCalled();
	});
});

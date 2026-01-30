import {
	isAdminRole,
	isOrganizationAdmin,
	isOrganizationOwner,
	verifyOrganizationMembership,
} from "@repo/api/lib/membership";
import { describe, expect, it, vi } from "vitest";

// Mock the database module
vi.mock("@repo/database", () => ({
	db: {
		member: {
			findUnique: vi.fn(),
		},
	},
}));

import { db } from "@repo/database";

const mockFindUnique = vi.mocked(db.member.findUnique);

describe("verifyOrganizationMembership", () => {
	const mockOrganizationId = "org-123";
	const mockUserId = "user-456";

	it("returns membership data when user is a member", async () => {
		const mockMembership = {
			id: "member-1",
			organization: {
				id: mockOrganizationId,
				name: "Test Org",
				slug: "test-org",
			},
			role: "owner",
			userId: mockUserId,
			organizationId: mockOrganizationId,
		};

		mockFindUnique.mockResolvedValue(mockMembership as any);

		const result = await verifyOrganizationMembership(
			mockOrganizationId,
			mockUserId,
		);

		expect(result).toEqual(mockMembership);
		expect(mockFindUnique).toHaveBeenCalledWith({
			where: {
				organizationId_userId: {
					organizationId: mockOrganizationId,
					userId: mockUserId,
				},
			},
			include: {
				organization: true,
			},
		});
	});

	it("returns null when user is not a member", async () => {
		mockFindUnique.mockResolvedValue(null);

		const result = await verifyOrganizationMembership(
			mockOrganizationId,
			mockUserId,
		);

		expect(result).toBeNull();
	});
});

describe("isOrganizationAdmin", () => {
	const mockOrganizationId = "org-123";
	const mockUserId = "user-456";

	it("returns true when user is owner", async () => {
		mockFindUnique.mockResolvedValue({
			role: "owner",
			organization: {},
		} as any);

		const result = await isOrganizationAdmin(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(true);
	});

	it("returns true when user is admin", async () => {
		mockFindUnique.mockResolvedValue({
			role: "admin",
			organization: {},
		} as any);

		const result = await isOrganizationAdmin(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(true);
	});

	it("returns false when user is member", async () => {
		mockFindUnique.mockResolvedValue({
			role: "member",
			organization: {},
		} as any);

		const result = await isOrganizationAdmin(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(false);
	});

	it("returns false when user is not a member", async () => {
		mockFindUnique.mockResolvedValue(null);

		const result = await isOrganizationAdmin(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(false);
	});
});

describe("isOrganizationOwner", () => {
	const mockOrganizationId = "org-123";
	const mockUserId = "user-456";

	it("returns true when user is owner", async () => {
		mockFindUnique.mockResolvedValue({
			role: "owner",
			organization: {},
		} as any);

		const result = await isOrganizationOwner(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(true);
	});

	it("returns false when user is admin", async () => {
		mockFindUnique.mockResolvedValue({
			role: "admin",
			organization: {},
		} as any);

		const result = await isOrganizationOwner(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(false);
	});

	it("returns false when user is not a member", async () => {
		mockFindUnique.mockResolvedValue(null);

		const result = await isOrganizationOwner(
			mockOrganizationId,
			mockUserId,
		);
		expect(result).toBe(false);
	});
});

describe("isAdminRole", () => {
	it("returns true for owner", () => {
		expect(isAdminRole("owner")).toBe(true);
	});

	it("returns true for admin", () => {
		expect(isAdminRole("admin")).toBe(true);
	});

	it("returns false for member", () => {
		expect(isAdminRole("member")).toBe(false);
	});
});

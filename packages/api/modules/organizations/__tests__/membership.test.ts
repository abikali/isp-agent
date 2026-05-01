import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		member: {
			findUnique: vi.fn(),
		},
		organizationRole: {
			findUnique: vi.fn(),
		},
	},
}));

import { db } from "@repo/database";
import {
	isAdminRole,
	verifyOrganizationMembership,
} from "../../../lib/membership";

const mockFindUnique = vi.mocked(db.member.findUnique);
const mockOrgRoleFindUnique = vi.mocked(db.organizationRole.findUnique);

describe("verifyOrganizationMembership", () => {
	const organizationId = "org-123";
	const userId = "user-456";

	it("returns membership data with rolePermissions and activeDealerId when user is a member", async () => {
		mockFindUnique.mockResolvedValue({
			id: "member-1",
			organizationId,
			userId,
			role: "owner",
			organization: {
				activeDealerId: "dealer-1",
				iradiusDisabled: false,
			},
		} as never);

		const result = await verifyOrganizationMembership(
			organizationId,
			userId,
		);

		expect(result).not.toBeNull();
		expect(result?.role).toBe("owner");
		expect(result?.activeDealerId).toBe("dealer-1");
		expect(result?.iradiusDisabled).toBe(false);
		expect(result?.rolePermissions).toBeUndefined();
		expect(mockFindUnique).toHaveBeenCalledWith({
			where: {
				organizationId_userId: { organizationId, userId },
			},
			include: {
				organization: {
					select: {
						activeDealerId: true,
						iradiusDisabled: true,
					},
				},
			},
		});
	});

	it("loads custom role permissions for non-system roles", async () => {
		mockFindUnique.mockResolvedValue({
			id: "member-1",
			organizationId,
			userId,
			role: "custom-collector",
			organization: { activeDealerId: null, iradiusDisabled: false },
		} as never);
		mockOrgRoleFindUnique.mockResolvedValue({
			organizationId,
			role: "custom-collector",
			permission: JSON.stringify({ customers: ["read:own"] }),
		} as never);

		const result = await verifyOrganizationMembership(
			organizationId,
			userId,
		);

		expect(result?.rolePermissions).toEqual({ customers: ["read:own"] });
	});

	it("returns null when user is not a member", async () => {
		mockFindUnique.mockResolvedValue(null);

		const result = await verifyOrganizationMembership(
			organizationId,
			userId,
		);
		expect(result).toBeNull();
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

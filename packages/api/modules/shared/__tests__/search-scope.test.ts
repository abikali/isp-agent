import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		member: { findUnique: vi.fn() },
		organizationRole: { findUnique: vi.fn() },
		employee: { findFirst: vi.fn() },
		ispDealer: { findFirst: vi.fn() },
	},
}));

import type { PermissionContext } from "../../../lib/permission";
import { allowedSearchTypes, SEARCH_TYPES } from "../lib/search-scope";

const base = { userId: "user-1", organizationId: "org-1" };

describe("allowedSearchTypes", () => {
	it("keeps every type for an owner", () => {
		const ctx: PermissionContext = { ...base, memberRole: "owner" };
		expect([...allowedSearchTypes(ctx)]).toEqual([...SEARCH_TYPES]);
	});

	it("drops types a custom role can't read (collector with customers read:own)", () => {
		const collector = {
			...base,
			memberRole: "collector" as PermissionContext["memberRole"],
			rolePermissions: {
				customers: ["read:own"],
				billing: ["collect:own"],
			},
		};
		expect([...allowedSearchTypes(collector)]).toEqual(["customer"]);
	});

	it("never widens beyond the requested types", () => {
		const ctx: PermissionContext = { ...base, memberRole: "owner" };
		expect([...allowedSearchTypes(ctx, ["task"])]).toEqual(["task"]);
		expect(allowedSearchTypes(ctx, []).size).toBe(0);
	});

	it("returns nothing for a custom role with no stored permissions", () => {
		const ctx = {
			...base,
			memberRole: "viewer" as PermissionContext["memberRole"],
		};
		expect(allowedSearchTypes(ctx).size).toBe(0);
	});
});

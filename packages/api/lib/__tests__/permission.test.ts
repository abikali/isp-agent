import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		member: { findUnique: vi.fn() },
		organizationRole: { findUnique: vi.fn() },
		employee: { findFirst: vi.fn() },
		ispDealer: { findFirst: vi.fn() },
	},
}));

import {
	getActionScope,
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	getDealerScopeViaCustomers,
	getPermissionContext,
	hasActionInRole,
	hasPermission,
	isAdmin,
	isResourceOwner,
	type PermissionContext,
	verifyPermission,
} from "../permission";

const ownerCtx: PermissionContext = {
	userId: "user-1",
	organizationId: "org-1",
	memberRole: "owner",
};
const adminCtx: PermissionContext = { ...ownerCtx, memberRole: "admin" };
const memberCtx: PermissionContext = { ...ownerCtx, memberRole: "member" };

describe("getPermissionContext", () => {
	it("captures id, org, and role", () => {
		const ctx = getPermissionContext("u", "o", "admin");
		expect(ctx).toEqual({
			userId: "u",
			organizationId: "o",
			memberRole: "admin",
			rolePermissions: undefined,
		});
	});

	it("preserves rolePermissions for custom roles", () => {
		const perms = { customers: ["read:own"] };
		expect(
			getPermissionContext("u", "o", "editor", perms).rolePermissions,
		).toBe(perms);
	});
});

describe("hasActionInRole", () => {
	it("recognises actions on system roles", () => {
		expect(hasActionInRole(ownerCtx, "customers", "read")).toBe(true);
		expect(hasActionInRole(memberCtx, "customers", "read")).toBe(true);
		expect(hasActionInRole(memberCtx, "customers", "create")).toBe(false);
	});

	it("falls back to rolePermissions for custom roles", () => {
		const ctx: PermissionContext = {
			...ownerCtx,
			memberRole: "editor" as PermissionContext["memberRole"],
			rolePermissions: { customers: ["read", "update:own"] },
		};
		expect(hasActionInRole(ctx, "customers", "read")).toBe(true);
		expect(hasActionInRole(ctx, "customers", "update")).toBe(true);
		expect(hasActionInRole(ctx, "customers", "delete")).toBe(false);
	});

	it("returns false for custom role with no rolePermissions", () => {
		const ctx: PermissionContext = {
			...ownerCtx,
			memberRole: "editor" as PermissionContext["memberRole"],
		};
		expect(hasActionInRole(ctx, "customers", "read")).toBe(false);
	});
});

describe("getActionScope", () => {
	it("returns 'all' for owner/admin regardless of action", () => {
		expect(getActionScope(ownerCtx, "customers", "read")).toBe("all");
		expect(getActionScope(adminCtx, "customers", "delete")).toBe("all");
	});

	it("returns scope from custom rolePermissions", () => {
		const ctx: PermissionContext = {
			...ownerCtx,
			memberRole: "collector" as PermissionContext["memberRole"],
			rolePermissions: { customers: ["read:own", "update"] },
		};
		expect(getActionScope(ctx, "customers", "read")).toBe("own");
		expect(getActionScope(ctx, "customers", "update")).toBe("all");
	});
});

describe("hasPermission + verifyPermission", () => {
	it("hasPermission honours rolePermissions and ownership", () => {
		const ctx: PermissionContext = {
			...ownerCtx,
			memberRole: "collector" as PermissionContext["memberRole"],
			rolePermissions: { customers: ["update:own"] },
		};
		expect(
			hasPermission(ctx, "customers", "update", {
				resourceCreatedById: "user-1",
			}),
		).toBe(true);
		expect(
			hasPermission(ctx, "customers", "update", {
				resourceCreatedById: "someone-else",
			}),
		).toBe(false);
	});

	it("verifyPermission throws FORBIDDEN when denied", () => {
		const ctx: PermissionContext = {
			...ownerCtx,
			memberRole: "member",
		};
		expect(() => verifyPermission(ctx, "customers", "delete")).toThrow(
			ORPCError,
		);
	});

	it("verifyPermission is a no-op when allowed", () => {
		expect(() =>
			verifyPermission(ownerCtx, "customers", "delete"),
		).not.toThrow();
	});
});

describe("isResourceOwner", () => {
	it("returns true on userId match", () => {
		expect(isResourceOwner(ownerCtx, "user-1")).toBe(true);
	});

	it("returns false otherwise", () => {
		expect(isResourceOwner(ownerCtx, "user-2")).toBe(false);
		expect(isResourceOwner(ownerCtx, null)).toBe(false);
		expect(isResourceOwner(ownerCtx, undefined)).toBe(false);
	});
});

describe("isAdmin", () => {
	it("is true for owner/admin, false otherwise", () => {
		expect(isAdmin(ownerCtx)).toBe(true);
		expect(isAdmin(adminCtx)).toBe(true);
		expect(isAdmin(memberCtx)).toBe(false);
	});
});

describe("dealer scope helpers", () => {
	it("getDealerScopeFilter coerces null to a null-id match", () => {
		expect(getDealerScopeFilter(null)).toEqual({ dealerId: null });
		expect(getDealerScopeFilter("dealer-1")).toEqual({
			dealerId: "dealer-1",
		});
	});

	it("getDealerScopeViaCustomer wraps the filter under the customer relation", () => {
		expect(getDealerScopeViaCustomer("dealer-1")).toEqual({
			customer: { dealerId: "dealer-1" },
		});
	});

	it("getDealerScopeViaCustomers wraps the filter under a customers some()", () => {
		expect(getDealerScopeViaCustomers("dealer-1")).toEqual({
			customers: { some: { dealerId: "dealer-1" } },
		});
	});
});

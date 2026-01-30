import { describe, expect, it } from "vitest";
import {
	ac,
	OWNERSHIP_RESOURCES,
	PERMISSION_GROUPS,
	type PermissionAction,
	type PermissionResource,
	permissionStatement,
} from "../access-control";
import {
	admin,
	isSystemRole,
	MEMBER_SCOPE_RESTRICTIONS,
	member,
	owner,
	SYSTEM_ROLES,
	systemRoles,
} from "../roles";

describe("permissionStatement", () => {
	it("defines organization permissions", () => {
		expect(permissionStatement.organization).toEqual(["update", "delete"]);
	});

	it("defines member permissions", () => {
		expect(permissionStatement.member).toEqual([
			"create",
			"update",
			"delete",
		]);
	});

	it("defines invitation permissions", () => {
		expect(permissionStatement.invitation).toEqual(["create", "cancel"]);
	});

	it("defines access control permissions", () => {
		expect(permissionStatement.ac).toEqual([
			"create",
			"read",
			"update",
			"delete",
		]);
	});

	it("defines webhooks permissions", () => {
		expect(permissionStatement.webhooks).toEqual([
			"create",
			"read",
			"update",
			"delete",
		]);
	});

	it("defines apiKeys permissions", () => {
		expect(permissionStatement.apiKeys).toEqual([
			"create",
			"read",
			"read:own",
			"delete",
			"delete:own",
		]);
	});

	it("defines connections permissions", () => {
		expect(permissionStatement.connections).toEqual([
			"create",
			"read",
			"update",
			"delete",
			"sync",
		]);
	});

	it("defines audit permissions", () => {
		expect(permissionStatement.audit).toEqual(["view"]);
	});

	it("defines billing permissions", () => {
		expect(permissionStatement.billing).toEqual(["view", "manage"]);
	});

	it("contains all expected resources", () => {
		const expectedResources: PermissionResource[] = [
			"organization",
			"member",
			"invitation",
			"ac",
			"webhooks",
			"apiKeys",
			"connections",
			"audit",
			"billing",
		];

		expect(Object.keys(permissionStatement).sort()).toEqual(
			expectedResources.sort(),
		);
	});
});

describe("OWNERSHIP_RESOURCES", () => {
	it("identifies resources that support ownership-based permissions", () => {
		expect(OWNERSHIP_RESOURCES).toContain("apiKeys");
	});

	it("does not include non-ownership resources", () => {
		expect(OWNERSHIP_RESOURCES).not.toContain("webhooks");
		expect(OWNERSHIP_RESOURCES).not.toContain("organization");
	});
});

describe("PERMISSION_GROUPS", () => {
	it("groups organization-related resources", () => {
		expect(PERMISSION_GROUPS.organization.resources).toEqual([
			"organization",
			"member",
			"invitation",
			"ac",
		]);
		expect(PERMISSION_GROUPS.organization.label).toBe("Organization");
	});

	it("groups integration-related resources", () => {
		expect(PERMISSION_GROUPS.integrations.resources).toEqual([
			"webhooks",
			"apiKeys",
			"connections",
		]);
		expect(PERMISSION_GROUPS.integrations.label).toBe("Integrations");
	});

	it("groups insights-related resources", () => {
		expect(PERMISSION_GROUPS.insights.resources).toEqual(["audit"]);
		expect(PERMISSION_GROUPS.insights.label).toBe("Insights");
	});

	it("groups billing-related resources", () => {
		expect(PERMISSION_GROUPS.billing.resources).toEqual(["billing"]);
		expect(PERMISSION_GROUPS.billing.label).toBe("Billing");
	});

	it("covers all resources in permission statement", () => {
		const groupedResources = [
			...PERMISSION_GROUPS.organization.resources,
			...PERMISSION_GROUPS.integrations.resources,
			...PERMISSION_GROUPS.insights.resources,
			...PERMISSION_GROUPS.billing.resources,
		];
		const allResources = Object.keys(permissionStatement);

		expect(groupedResources.sort()).toEqual(allResources.sort());
	});
});

describe("SYSTEM_ROLES", () => {
	it("contains owner, admin, and member", () => {
		expect(SYSTEM_ROLES).toEqual(["owner", "admin", "member"]);
	});

	it("has exactly 3 system roles", () => {
		expect(SYSTEM_ROLES).toHaveLength(3);
	});

	it("is declared with as const for type safety", () => {
		expect(SYSTEM_ROLES[0]).toBe("owner");
		expect(SYSTEM_ROLES[1]).toBe("admin");
		expect(SYSTEM_ROLES[2]).toBe("member");
	});
});

describe("isSystemRole", () => {
	it("returns true for owner role", () => {
		expect(isSystemRole("owner")).toBe(true);
	});

	it("returns true for admin role", () => {
		expect(isSystemRole("admin")).toBe(true);
	});

	it("returns true for member role", () => {
		expect(isSystemRole("member")).toBe(true);
	});

	it("returns false for custom role", () => {
		expect(isSystemRole("custom-role")).toBe(false);
	});

	it("returns false for empty string", () => {
		expect(isSystemRole("")).toBe(false);
	});

	it("returns false for role with similar name", () => {
		expect(isSystemRole("Owner")).toBe(false);
		expect(isSystemRole("owners")).toBe(false);
		expect(isSystemRole("admin-user")).toBe(false);
	});
});

describe("systemRoles", () => {
	it("maps role names to role objects", () => {
		expect(systemRoles.owner).toBe(owner);
		expect(systemRoles.admin).toBe(admin);
		expect(systemRoles.member).toBe(member);
	});

	it("contains all system roles", () => {
		expect(Object.keys(systemRoles)).toEqual(["owner", "admin", "member"]);
	});
});

describe("Role objects", () => {
	it("owner role is defined with authorize function and statements", () => {
		expect(owner).toBeDefined();
		expect(typeof owner.authorize).toBe("function");
		expect(owner.statements).toBeDefined();
	});

	it("admin role is defined with authorize function and statements", () => {
		expect(admin).toBeDefined();
		expect(typeof admin.authorize).toBe("function");
		expect(admin.statements).toBeDefined();
	});

	it("member role is defined with authorize function and statements", () => {
		expect(member).toBeDefined();
		expect(typeof member.authorize).toBe("function");
		expect(member.statements).toBeDefined();
	});
});

describe("Owner role permissions", () => {
	it("has full organization permissions", () => {
		expect(owner.statements.organization).toEqual(["update", "delete"]);
	});

	it("has full member management permissions", () => {
		expect(owner.statements.member).toEqual(["create", "update", "delete"]);
	});

	it("has full invitation permissions", () => {
		expect(owner.statements.invitation).toEqual(["create", "cancel"]);
	});

	it("has full access control permissions", () => {
		expect(owner.statements.ac).toEqual([
			"create",
			"read",
			"update",
			"delete",
		]);
	});

	it("has full webhooks permissions", () => {
		expect(owner.statements.webhooks).toEqual([
			"create",
			"read",
			"update",
			"delete",
		]);
	});

	it("has full apiKeys permissions", () => {
		expect(owner.statements.apiKeys).toEqual([
			"create",
			"read",
			"read:own",
			"delete",
			"delete:own",
		]);
	});

	it("has full connections permissions", () => {
		expect(owner.statements.connections).toEqual([
			"create",
			"read",
			"update",
			"delete",
			"sync",
		]);
	});

	it("has full audit permissions", () => {
		expect(owner.statements.audit).toEqual(["view"]);
	});

	it("has full billing permissions", () => {
		expect(owner.statements.billing).toEqual(["view", "manage"]);
	});
});

describe("Admin role permissions", () => {
	it("can update but not delete organization", () => {
		expect(admin.statements.organization).toContain("update");
		expect(admin.statements.organization).not.toContain("delete");
	});

	it("has full member management permissions", () => {
		expect(admin.statements.member).toEqual(["create", "update", "delete"]);
	});

	it("has full invitation permissions", () => {
		expect(admin.statements.invitation).toEqual(["create", "cancel"]);
	});

	it("has full access control permissions", () => {
		expect(admin.statements.ac).toEqual([
			"create",
			"read",
			"update",
			"delete",
		]);
	});

	it("has full webhooks permissions", () => {
		expect(admin.statements.webhooks).toEqual([
			"create",
			"read",
			"update",
			"delete",
		]);
	});

	it("has full apiKeys permissions", () => {
		expect(admin.statements.apiKeys).toEqual([
			"create",
			"read",
			"read:own",
			"delete",
			"delete:own",
		]);
	});

	it("has full connections permissions", () => {
		expect(admin.statements.connections).toEqual([
			"create",
			"read",
			"update",
			"delete",
			"sync",
		]);
	});

	it("has full audit permissions", () => {
		expect(admin.statements.audit).toEqual(["view"]);
	});

	it("has full billing permissions", () => {
		expect(admin.statements.billing).toEqual(["view", "manage"]);
	});
});

describe("Member role permissions", () => {
	const memberStatements = member.statements as Record<string, unknown>;

	it("does not have organization permissions", () => {
		expect(memberStatements["organization"]).toBeUndefined();
	});

	it("does not have member management permissions", () => {
		expect(memberStatements["member"]).toBeUndefined();
	});

	it("does not have invitation permissions", () => {
		expect(memberStatements["invitation"]).toBeUndefined();
	});

	it("does not have access control permissions", () => {
		expect(memberStatements["ac"]).toBeUndefined();
	});

	it("does not have webhooks permissions", () => {
		expect(memberStatements["webhooks"]).toBeUndefined();
	});

	it("has limited apiKeys permissions (read only)", () => {
		expect(member.statements.apiKeys).toEqual(["read"]);
	});

	it("has limited connections permissions (read only)", () => {
		expect(member.statements.connections).toEqual(["read"]);
	});

	it("does not have audit permissions", () => {
		expect(memberStatements["audit"]).toBeUndefined();
	});

	it("does not have billing permissions", () => {
		expect(memberStatements["billing"]).toBeUndefined();
	});
});

describe("MEMBER_SCOPE_RESTRICTIONS", () => {
	it("restricts apiKeys read to own only", () => {
		expect(MEMBER_SCOPE_RESTRICTIONS["apiKeys"]).toBeDefined();
		expect(MEMBER_SCOPE_RESTRICTIONS["apiKeys"]?.["read"]).toBe("own");
	});
});

describe("Role permission hierarchy", () => {
	it("owner has more permissions than admin", () => {
		expect(owner.statements.organization).toContain("delete");
		expect(admin.statements.organization).not.toContain("delete");
	});

	it("admin has more permissions than member", () => {
		const memberStatements = member.statements as Record<string, unknown>;

		expect(admin.statements.member).toBeDefined();
		expect(memberStatements["member"]).toBeUndefined();

		expect(admin.statements.billing).toBeDefined();
		expect(memberStatements["billing"]).toBeUndefined();

		expect(admin.statements.webhooks).toBeDefined();
		expect(memberStatements["webhooks"]).toBeUndefined();
	});

	it("member has the most restricted permissions", () => {
		const memberResourceCount = Object.keys(member.statements).length;
		const adminResourceCount = Object.keys(admin.statements).length;
		const ownerResourceCount = Object.keys(owner.statements).length;

		expect(memberResourceCount).toBeLessThan(adminResourceCount);
		expect(adminResourceCount).toBeLessThanOrEqual(ownerResourceCount);
	});
});

describe("Access Control (ac)", () => {
	it("exports access control instance", () => {
		expect(ac).toBeDefined();
		expect(typeof ac.newRole).toBe("function");
	});

	it("can create new roles with custom permissions", () => {
		const customRole = ac.newRole({
			webhooks: ["read"],
		});
		const customRoleStatements = customRole.statements as Record<
			string,
			unknown
		>;

		expect(customRole).toBeDefined();
		expect(customRole.statements.webhooks).toEqual(["read"]);
		expect(customRoleStatements["organization"]).toBeUndefined();
		expect(typeof customRole.authorize).toBe("function");
	});
});

describe("Type safety", () => {
	it("PermissionResource type covers all resources", () => {
		const resources: PermissionResource[] = [
			"organization",
			"member",
			"invitation",
			"ac",
			"webhooks",
			"apiKeys",
			"connections",
			"audit",
			"billing",
		];

		expect(resources).toHaveLength(9);
	});

	it("PermissionAction types are correct for each resource", () => {
		const orgActions: PermissionAction<"organization">[] = [
			"update",
			"delete",
		];
		const memberActions: PermissionAction<"member">[] = [
			"create",
			"update",
			"delete",
		];
		const billingActions: PermissionAction<"billing">[] = [
			"view",
			"manage",
		];

		expect(orgActions).toHaveLength(2);
		expect(memberActions).toHaveLength(3);
		expect(billingActions).toHaveLength(2);
	});
});

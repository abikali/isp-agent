import { describe, expect, it } from "vitest";
import {
	formatAction,
	isActionScoped,
	OWNERSHIP_RESOURCES,
	parseAction,
	SCOPED_ACTIONS,
} from "../access-control";
import { getSystemRoleScope, MEMBER_SCOPE_RESTRICTIONS } from "../roles";

describe("isActionScoped", () => {
	describe("profiles resource", () => {
		it("returns true for read action (scoped)", () => {
			expect(isActionScoped("profiles", "read")).toBe(true);
		});

		it("returns true for update action (scoped)", () => {
			expect(isActionScoped("profiles", "update")).toBe(true);
		});

		it("returns true for delete action (scoped)", () => {
			expect(isActionScoped("profiles", "delete")).toBe(true);
		});

		it("returns true for manage-links action (scoped)", () => {
			expect(isActionScoped("profiles", "manage-links")).toBe(true);
		});

		it("returns true for manage-leads action (scoped)", () => {
			expect(isActionScoped("profiles", "manage-leads")).toBe(true);
		});

		it("returns false for create action (not scoped)", () => {
			expect(isActionScoped("profiles", "create")).toBe(false);
		});
	});

	describe("contacts resource", () => {
		it("returns true for read action (scoped)", () => {
			expect(isActionScoped("contacts", "read")).toBe(true);
		});

		it("returns true for update action (scoped)", () => {
			expect(isActionScoped("contacts", "update")).toBe(true);
		});

		it("returns true for delete action (scoped)", () => {
			expect(isActionScoped("contacts", "delete")).toBe(true);
		});

		it("returns false for create action (not scoped)", () => {
			expect(isActionScoped("contacts", "create")).toBe(false);
		});

		it("returns false for import action (not scoped)", () => {
			expect(isActionScoped("contacts", "import")).toBe(false);
		});

		it("returns false for export action (not scoped)", () => {
			expect(isActionScoped("contacts", "export")).toBe(false);
		});
	});

	describe("apiKeys resource", () => {
		it("returns true for read action (scoped)", () => {
			expect(isActionScoped("apiKeys", "read")).toBe(true);
		});

		it("returns true for delete action (scoped)", () => {
			expect(isActionScoped("apiKeys", "delete")).toBe(true);
		});

		it("returns false for create action (not scoped)", () => {
			expect(isActionScoped("apiKeys", "create")).toBe(false);
		});
	});

	describe("non-ownership resources", () => {
		it("returns false for webhooks/read (not ownership resource)", () => {
			expect(isActionScoped("webhooks", "read")).toBe(false);
		});

		it("returns false for webhooks/create (not ownership resource)", () => {
			expect(isActionScoped("webhooks", "create")).toBe(false);
		});

		it("returns false for organization/update (not ownership resource)", () => {
			expect(isActionScoped("organization", "update")).toBe(false);
		});

		it("returns false for organization/delete (not ownership resource)", () => {
			expect(isActionScoped("organization", "delete")).toBe(false);
		});

		it("returns false for billing/view (not ownership resource)", () => {
			expect(isActionScoped("billing", "view")).toBe(false);
		});

		it("returns false for billing/manage (not ownership resource)", () => {
			expect(isActionScoped("billing", "manage")).toBe(false);
		});

		it("returns false for analytics/read (not ownership resource)", () => {
			expect(isActionScoped("analytics", "read")).toBe(false);
		});

		it("returns false for member/create (not ownership resource)", () => {
			expect(isActionScoped("member", "create")).toBe(false);
		});

		it("returns false for invitation/create (not ownership resource)", () => {
			expect(isActionScoped("invitation", "create")).toBe(false);
		});

		it("returns false for ac/create (not ownership resource)", () => {
			expect(isActionScoped("ac", "create")).toBe(false);
		});

		it("returns false for audit/view (not ownership resource)", () => {
			expect(isActionScoped("audit", "view")).toBe(false);
		});

		it("returns false for products/read (not ownership resource)", () => {
			expect(isActionScoped("products", "read")).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("returns false for unknown resource", () => {
			expect(isActionScoped("unknown-resource", "read")).toBe(false);
		});

		it("returns false for unknown action on valid resource", () => {
			expect(isActionScoped("profiles", "unknown-action")).toBe(false);
		});

		it("returns false for empty resource", () => {
			expect(isActionScoped("", "read")).toBe(false);
		});

		it("returns false for empty action", () => {
			expect(isActionScoped("profiles", "")).toBe(false);
		});
	});

	describe("SCOPED_ACTIONS completeness", () => {
		it("only ownership resources have scoped actions", () => {
			const scopedResourceKeys = Object.keys(SCOPED_ACTIONS);
			expect(scopedResourceKeys.sort()).toEqual(
				[...OWNERSHIP_RESOURCES].sort(),
			);
		});

		it("apiKeys has all expected scoped actions", () => {
			expect(SCOPED_ACTIONS.apiKeys).toEqual(["read", "delete"]);
		});
	});
});

describe("parseAction", () => {
	describe("standard actions (no scope suffix)", () => {
		it("parses 'read' to { action: 'read', scope: 'all' }", () => {
			expect(parseAction("read")).toEqual({
				action: "read",
				scope: "all",
			});
		});

		it("parses 'update' to { action: 'update', scope: 'all' }", () => {
			expect(parseAction("update")).toEqual({
				action: "update",
				scope: "all",
			});
		});

		it("parses 'delete' to { action: 'delete', scope: 'all' }", () => {
			expect(parseAction("delete")).toEqual({
				action: "delete",
				scope: "all",
			});
		});

		it("parses 'create' to { action: 'create', scope: 'all' }", () => {
			expect(parseAction("create")).toEqual({
				action: "create",
				scope: "all",
			});
		});

		it("parses 'manage-links' to { action: 'manage-links', scope: 'all' }", () => {
			expect(parseAction("manage-links")).toEqual({
				action: "manage-links",
				scope: "all",
			});
		});

		it("parses 'manage-leads' to { action: 'manage-leads', scope: 'all' }", () => {
			expect(parseAction("manage-leads")).toEqual({
				action: "manage-leads",
				scope: "all",
			});
		});

		it("parses 'import' to { action: 'import', scope: 'all' }", () => {
			expect(parseAction("import")).toEqual({
				action: "import",
				scope: "all",
			});
		});

		it("parses 'export' to { action: 'export', scope: 'all' }", () => {
			expect(parseAction("export")).toEqual({
				action: "export",
				scope: "all",
			});
		});

		it("parses 'view' to { action: 'view', scope: 'all' }", () => {
			expect(parseAction("view")).toEqual({
				action: "view",
				scope: "all",
			});
		});

		it("parses 'manage' to { action: 'manage', scope: 'all' }", () => {
			expect(parseAction("manage")).toEqual({
				action: "manage",
				scope: "all",
			});
		});

		it("parses 'cancel' to { action: 'cancel', scope: 'all' }", () => {
			expect(parseAction("cancel")).toEqual({
				action: "cancel",
				scope: "all",
			});
		});

		it("parses 'assign' to { action: 'assign', scope: 'all' }", () => {
			expect(parseAction("assign")).toEqual({
				action: "assign",
				scope: "all",
			});
		});

		it("parses 'unassign' to { action: 'unassign', scope: 'all' }", () => {
			expect(parseAction("unassign")).toEqual({
				action: "unassign",
				scope: "all",
			});
		});

		it("parses 'update-config' to { action: 'update-config', scope: 'all' }", () => {
			expect(parseAction("update-config")).toEqual({
				action: "update-config",
				scope: "all",
			});
		});
	});

	describe("scoped actions (with :own suffix)", () => {
		it("parses 'read:own' to { action: 'read', scope: 'own' }", () => {
			expect(parseAction("read:own")).toEqual({
				action: "read",
				scope: "own",
			});
		});

		it("parses 'update:own' to { action: 'update', scope: 'own' }", () => {
			expect(parseAction("update:own")).toEqual({
				action: "update",
				scope: "own",
			});
		});

		it("parses 'delete:own' to { action: 'delete', scope: 'own' }", () => {
			expect(parseAction("delete:own")).toEqual({
				action: "delete",
				scope: "own",
			});
		});

		it("parses 'manage-links:own' to { action: 'manage-links', scope: 'own' }", () => {
			expect(parseAction("manage-links:own")).toEqual({
				action: "manage-links",
				scope: "own",
			});
		});

		it("parses 'manage-leads:own' to { action: 'manage-leads', scope: 'own' }", () => {
			expect(parseAction("manage-leads:own")).toEqual({
				action: "manage-leads",
				scope: "own",
			});
		});

		it("parses 'import:own' to { action: 'import', scope: 'own' }", () => {
			expect(parseAction("import:own")).toEqual({
				action: "import",
				scope: "own",
			});
		});

		it("parses 'export:own' to { action: 'export', scope: 'own' }", () => {
			expect(parseAction("export:own")).toEqual({
				action: "export",
				scope: "own",
			});
		});
	});

	describe("edge cases", () => {
		it("handles empty string", () => {
			expect(parseAction("")).toEqual({ action: "", scope: "all" });
		});

		it("handles action with colon but not :own suffix", () => {
			expect(parseAction("update:all")).toEqual({
				action: "update:all",
				scope: "all",
			});
		});

		it("handles action ending with :owning (not :own)", () => {
			expect(parseAction("update:owning")).toEqual({
				action: "update:owning",
				scope: "all",
			});
		});

		it("handles :own in the middle of action name", () => {
			expect(parseAction("some:own:action")).toEqual({
				action: "some:own:action",
				scope: "all",
			});
		});
	});
});

describe("formatAction", () => {
	describe("formatting with 'all' scope", () => {
		it("formats ('read', 'all') to 'read'", () => {
			expect(formatAction("read", "all")).toBe("read");
		});

		it("formats ('update', 'all') to 'update'", () => {
			expect(formatAction("update", "all")).toBe("update");
		});

		it("formats ('delete', 'all') to 'delete'", () => {
			expect(formatAction("delete", "all")).toBe("delete");
		});

		it("formats ('create', 'all') to 'create'", () => {
			expect(formatAction("create", "all")).toBe("create");
		});

		it("formats ('manage-links', 'all') to 'manage-links'", () => {
			expect(formatAction("manage-links", "all")).toBe("manage-links");
		});

		it("formats ('manage-leads', 'all') to 'manage-leads'", () => {
			expect(formatAction("manage-leads", "all")).toBe("manage-leads");
		});
	});

	describe("formatting with 'own' scope", () => {
		it("formats ('read', 'own') to 'read:own'", () => {
			expect(formatAction("read", "own")).toBe("read:own");
		});

		it("formats ('update', 'own') to 'update:own'", () => {
			expect(formatAction("update", "own")).toBe("update:own");
		});

		it("formats ('delete', 'own') to 'delete:own'", () => {
			expect(formatAction("delete", "own")).toBe("delete:own");
		});

		it("formats ('create', 'own') to 'create:own'", () => {
			expect(formatAction("create", "own")).toBe("create:own");
		});

		it("formats ('manage-links', 'own') to 'manage-links:own'", () => {
			expect(formatAction("manage-links", "own")).toBe(
				"manage-links:own",
			);
		});

		it("formats ('manage-leads', 'own') to 'manage-leads:own'", () => {
			expect(formatAction("manage-leads", "own")).toBe(
				"manage-leads:own",
			);
		});
	});

	describe("roundtrip with parseAction", () => {
		it("parseAction(formatAction('read', 'all')) returns original", () => {
			const formatted = formatAction("read", "all");
			const parsed = parseAction(formatted);
			expect(parsed).toEqual({ action: "read", scope: "all" });
		});

		it("parseAction(formatAction('read', 'own')) returns original", () => {
			const formatted = formatAction("read", "own");
			const parsed = parseAction(formatted);
			expect(parsed).toEqual({ action: "read", scope: "own" });
		});

		it("parseAction(formatAction('manage-links', 'own')) returns original", () => {
			const formatted = formatAction("manage-links", "own");
			const parsed = parseAction(formatted);
			expect(parsed).toEqual({ action: "manage-links", scope: "own" });
		});
	});
});

describe("getSystemRoleScope", () => {
	describe("owner role", () => {
		it("returns 'all' for profiles/update", () => {
			expect(getSystemRoleScope("owner", "profiles", "update")).toBe(
				"all",
			);
		});

		it("returns 'all' for profiles/delete", () => {
			expect(getSystemRoleScope("owner", "profiles", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for profiles/manage-links", () => {
			expect(
				getSystemRoleScope("owner", "profiles", "manage-links"),
			).toBe("all");
		});

		it("returns 'all' for profiles/manage-leads", () => {
			expect(
				getSystemRoleScope("owner", "profiles", "manage-leads"),
			).toBe("all");
		});

		it("returns 'all' for contacts/update", () => {
			expect(getSystemRoleScope("owner", "contacts", "update")).toBe(
				"all",
			);
		});

		it("returns 'all' for contacts/delete", () => {
			expect(getSystemRoleScope("owner", "contacts", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for apiKeys/read", () => {
			expect(getSystemRoleScope("owner", "apiKeys", "read")).toBe("all");
		});

		it("returns 'all' for any resource/action combination", () => {
			expect(getSystemRoleScope("owner", "webhooks", "create")).toBe(
				"all",
			);
			expect(getSystemRoleScope("owner", "billing", "manage")).toBe(
				"all",
			);
			expect(getSystemRoleScope("owner", "organization", "delete")).toBe(
				"all",
			);
		});
	});

	describe("admin role", () => {
		it("returns 'all' for profiles/update", () => {
			expect(getSystemRoleScope("admin", "profiles", "update")).toBe(
				"all",
			);
		});

		it("returns 'all' for profiles/delete", () => {
			expect(getSystemRoleScope("admin", "profiles", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for profiles/manage-links", () => {
			expect(
				getSystemRoleScope("admin", "profiles", "manage-links"),
			).toBe("all");
		});

		it("returns 'all' for profiles/manage-leads", () => {
			expect(
				getSystemRoleScope("admin", "profiles", "manage-leads"),
			).toBe("all");
		});

		it("returns 'all' for contacts/update", () => {
			expect(getSystemRoleScope("admin", "contacts", "update")).toBe(
				"all",
			);
		});

		it("returns 'all' for contacts/delete", () => {
			expect(getSystemRoleScope("admin", "contacts", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for apiKeys/read", () => {
			expect(getSystemRoleScope("admin", "apiKeys", "read")).toBe("all");
		});

		it("returns 'all' for any resource/action combination", () => {
			expect(getSystemRoleScope("admin", "webhooks", "create")).toBe(
				"all",
			);
			expect(getSystemRoleScope("admin", "billing", "manage")).toBe(
				"all",
			);
		});
	});

	describe("member role - restricted actions", () => {
		it("returns 'own' for profiles/update", () => {
			expect(getSystemRoleScope("member", "profiles", "update")).toBe(
				"own",
			);
		});

		it("returns 'own' for profiles/delete", () => {
			expect(getSystemRoleScope("member", "profiles", "delete")).toBe(
				"own",
			);
		});

		it("returns 'own' for profiles/manage-links", () => {
			expect(
				getSystemRoleScope("member", "profiles", "manage-links"),
			).toBe("own");
		});

		it("returns 'own' for profiles/manage-leads", () => {
			expect(
				getSystemRoleScope("member", "profiles", "manage-leads"),
			).toBe("own");
		});

		it("returns 'own' for contacts/update", () => {
			expect(getSystemRoleScope("member", "contacts", "update")).toBe(
				"own",
			);
		});

		it("returns 'own' for contacts/delete", () => {
			expect(getSystemRoleScope("member", "contacts", "delete")).toBe(
				"own",
			);
		});

		it("returns 'own' for apiKeys/read", () => {
			expect(getSystemRoleScope("member", "apiKeys", "read")).toBe("own");
		});
	});

	describe("member role - non-restricted actions", () => {
		it("returns 'all' for profiles/create", () => {
			expect(getSystemRoleScope("member", "profiles", "create")).toBe(
				"all",
			);
		});

		it("returns 'own' for profiles/read", () => {
			expect(getSystemRoleScope("member", "profiles", "read")).toBe(
				"own",
			);
		});

		it("returns 'all' for contacts/create", () => {
			expect(getSystemRoleScope("member", "contacts", "create")).toBe(
				"all",
			);
		});

		it("returns 'own' for contacts/read", () => {
			expect(getSystemRoleScope("member", "contacts", "read")).toBe(
				"own",
			);
		});

		it("returns 'all' for contacts/import", () => {
			expect(getSystemRoleScope("member", "contacts", "import")).toBe(
				"all",
			);
		});

		it("returns 'all' for contacts/export", () => {
			expect(getSystemRoleScope("member", "contacts", "export")).toBe(
				"all",
			);
		});

		it("returns 'all' for apiKeys/create", () => {
			expect(getSystemRoleScope("member", "apiKeys", "create")).toBe(
				"all",
			);
		});

		it("returns 'all' for apiKeys/delete", () => {
			expect(getSystemRoleScope("member", "apiKeys", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for analytics/read", () => {
			expect(getSystemRoleScope("member", "analytics", "read")).toBe(
				"all",
			);
		});

		it("returns 'all' for products/read", () => {
			expect(getSystemRoleScope("member", "products", "read")).toBe(
				"all",
			);
		});
	});

	describe("custom role (non-system)", () => {
		it("returns 'all' for any resource/action on custom role", () => {
			expect(getSystemRoleScope("editor", "profiles", "update")).toBe(
				"all",
			);
			expect(getSystemRoleScope("viewer", "contacts", "delete")).toBe(
				"all",
			);
			expect(getSystemRoleScope("manager", "apiKeys", "read")).toBe(
				"all",
			);
		});

		it("returns 'all' for empty role string", () => {
			expect(getSystemRoleScope("", "profiles", "update")).toBe("all");
		});
	});

	describe("MEMBER_SCOPE_RESTRICTIONS completeness", () => {
		it("profiles has all expected restrictions", () => {
			expect(MEMBER_SCOPE_RESTRICTIONS["profiles"]).toEqual({
				read: "own",
				update: "own",
				delete: "own",
				"manage-links": "own",
				"manage-leads": "own",
			});
		});

		it("contacts has all expected restrictions", () => {
			expect(MEMBER_SCOPE_RESTRICTIONS["contacts"]).toEqual({
				read: "own",
				update: "own",
				delete: "own",
			});
		});

		it("apiKeys has all expected restrictions", () => {
			expect(MEMBER_SCOPE_RESTRICTIONS["apiKeys"]).toEqual({
				read: "own",
			});
		});

		it("only profiles, contacts, and apiKeys have restrictions", () => {
			const restrictedResources = Object.keys(MEMBER_SCOPE_RESTRICTIONS);
			expect(restrictedResources.sort()).toEqual(
				["profiles", "contacts", "apiKeys"].sort(),
			);
		});
	});
});

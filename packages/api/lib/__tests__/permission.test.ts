import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import {
	getActionScope,
	getOwnershipFilter,
	getPermissionContext,
	hasActionInRole,
	hasPermission,
	isAdmin,
	isResourceOwner,
	type PermissionContext,
	verifyPermission,
} from "../permission";

describe("getPermissionContext", () => {
	it("creates context with userId, organizationId, and memberRole", () => {
		const context = getPermissionContext("user-123", "org-456", "admin");

		expect(context.userId).toBe("user-123");
		expect(context.organizationId).toBe("org-456");
		expect(context.memberRole).toBe("admin");
	});

	it("includes rolePermissions when provided", () => {
		const permissions = { profiles: ["read", "update:own"] };
		const context = getPermissionContext(
			"user-123",
			"org-456",
			"editor",
			permissions,
		);

		expect(context.rolePermissions).toEqual(permissions);
	});

	it("handles undefined rolePermissions", () => {
		const context = getPermissionContext("user-123", "org-456", "member");

		expect(context.rolePermissions).toBeUndefined();
	});

	it("casts role string to MemberRole type", () => {
		const context = getPermissionContext(
			"user-123",
			"org-456",
			"custom-role" as string,
		);

		expect(context.memberRole).toBe("custom-role");
	});

	it("handles all system roles", () => {
		const ownerContext = getPermissionContext(
			"user-123",
			"org-456",
			"owner",
		);
		const adminContext = getPermissionContext(
			"user-123",
			"org-456",
			"admin",
		);
		const memberContext = getPermissionContext(
			"user-123",
			"org-456",
			"member",
		);

		expect(ownerContext.memberRole).toBe("owner");
		expect(adminContext.memberRole).toBe("admin");
		expect(memberContext.memberRole).toBe("member");
	});
});

describe("hasActionInRole", () => {
	describe("system roles", () => {
		it("returns true for owner role (all permissions granted)", () => {
			const ownerContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "owner",
			};

			expect(hasActionInRole(ownerContext, "profiles", "read")).toBe(
				true,
			);
			expect(hasActionInRole(ownerContext, "profiles", "delete")).toBe(
				true,
			);
			expect(hasActionInRole(ownerContext, "webhooks", "create")).toBe(
				true,
			);
		});

		it("returns true for admin role (all permissions granted)", () => {
			const adminContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "admin",
			};

			expect(hasActionInRole(adminContext, "profiles", "read")).toBe(
				true,
			);
			expect(hasActionInRole(adminContext, "contacts", "delete")).toBe(
				true,
			);
		});

		it("returns true for member role (permissions handled by system)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(hasActionInRole(memberContext, "profiles", "read")).toBe(
				true,
			);
			expect(hasActionInRole(memberContext, "contacts", "create")).toBe(
				true,
			);
		});
	});

	describe("custom roles", () => {
		it("returns true when action exists in permissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update", "delete"],
				},
			};

			expect(hasActionInRole(customContext, "profiles", "read")).toBe(
				true,
			);
			expect(hasActionInRole(customContext, "profiles", "update")).toBe(
				true,
			);
			expect(hasActionInRole(customContext, "profiles", "delete")).toBe(
				true,
			);
		});

		it("returns true when action exists with :own suffix", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update:own", "delete:own"],
				},
			};

			expect(hasActionInRole(customContext, "profiles", "read")).toBe(
				true,
			);
			expect(hasActionInRole(customContext, "profiles", "update")).toBe(
				true,
			);
			expect(hasActionInRole(customContext, "profiles", "delete")).toBe(
				true,
			);
		});

		it("returns false when action not in permissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			expect(hasActionInRole(customContext, "profiles", "update")).toBe(
				false,
			);
			expect(hasActionInRole(customContext, "profiles", "delete")).toBe(
				false,
			);
		});

		it("returns false when resource not in permissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			expect(hasActionInRole(customContext, "contacts", "read")).toBe(
				false,
			);
			expect(hasActionInRole(customContext, "webhooks", "create")).toBe(
				false,
			);
		});

		it("returns false when rolePermissions is undefined", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
			};

			expect(hasActionInRole(customContext, "profiles", "read")).toBe(
				false,
			);
			expect(hasActionInRole(customContext, "contacts", "create")).toBe(
				false,
			);
		});

		it("returns false when rolePermissions is empty object", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {},
			};

			expect(hasActionInRole(customContext, "profiles", "read")).toBe(
				false,
			);
		});
	});
});

describe("getActionScope", () => {
	describe("owner role", () => {
		const ownerContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "owner",
		};

		it("returns 'all' for any profiles action", () => {
			expect(getActionScope(ownerContext, "profiles", "read")).toBe(
				"all",
			);
			expect(getActionScope(ownerContext, "profiles", "update")).toBe(
				"all",
			);
			expect(getActionScope(ownerContext, "profiles", "delete")).toBe(
				"all",
			);
			expect(
				getActionScope(ownerContext, "profiles", "manage-links"),
			).toBe("all");
			expect(
				getActionScope(ownerContext, "profiles", "manage-leads"),
			).toBe("all");
		});

		it("returns 'all' for any contacts action", () => {
			expect(getActionScope(ownerContext, "contacts", "read")).toBe(
				"all",
			);
			expect(getActionScope(ownerContext, "contacts", "update")).toBe(
				"all",
			);
			expect(getActionScope(ownerContext, "contacts", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for any apiKeys action", () => {
			expect(getActionScope(ownerContext, "apiKeys", "read")).toBe("all");
			expect(getActionScope(ownerContext, "apiKeys", "delete")).toBe(
				"all",
			);
		});
	});

	describe("admin role", () => {
		const adminContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "admin",
		};

		it("returns 'all' for any profiles action", () => {
			expect(getActionScope(adminContext, "profiles", "read")).toBe(
				"all",
			);
			expect(getActionScope(adminContext, "profiles", "update")).toBe(
				"all",
			);
			expect(getActionScope(adminContext, "profiles", "delete")).toBe(
				"all",
			);
			expect(
				getActionScope(adminContext, "profiles", "manage-links"),
			).toBe("all");
		});

		it("returns 'all' for any contacts action", () => {
			expect(getActionScope(adminContext, "contacts", "read")).toBe(
				"all",
			);
			expect(getActionScope(adminContext, "contacts", "update")).toBe(
				"all",
			);
			expect(getActionScope(adminContext, "contacts", "delete")).toBe(
				"all",
			);
		});

		it("returns 'all' for any apiKeys action", () => {
			expect(getActionScope(adminContext, "apiKeys", "read")).toBe("all");
			expect(getActionScope(adminContext, "apiKeys", "delete")).toBe(
				"all",
			);
		});
	});

	describe("member role (system)", () => {
		const memberContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "member",
		};

		it("returns 'all' for unrestricted resources (profiles, contacts)", () => {
			// profiles and contacts are not in MEMBER_SCOPE_RESTRICTIONS
			expect(getActionScope(memberContext, "profiles", "update")).toBe(
				"all",
			);
			expect(getActionScope(memberContext, "profiles", "read")).toBe(
				"all",
			);
			expect(getActionScope(memberContext, "profiles", "create")).toBe(
				"all",
			);
			expect(getActionScope(memberContext, "contacts", "read")).toBe(
				"all",
			);
			expect(getActionScope(memberContext, "contacts", "update")).toBe(
				"all",
			);
		});

		it("returns 'own' for apiKeys/read (only restricted action)", () => {
			expect(getActionScope(memberContext, "apiKeys", "read")).toBe(
				"own",
			);
		});

		it("returns 'all' for apiKeys/create and apiKeys/delete", () => {
			expect(getActionScope(memberContext, "apiKeys", "create")).toBe(
				"all",
			);
			expect(getActionScope(memberContext, "apiKeys", "delete")).toBe(
				"all",
			);
		});
	});

	describe("custom role", () => {
		it("returns 'all' when action is in permissions without :own suffix", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update", "delete"],
				},
			};

			expect(getActionScope(customContext, "profiles", "read")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "profiles", "update")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "profiles", "delete")).toBe(
				"all",
			);
		});

		it("returns 'own' when action is in permissions with :own suffix", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update:own", "delete:own"],
				},
			};

			expect(getActionScope(customContext, "profiles", "read")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "profiles", "update")).toBe(
				"own",
			);
			expect(getActionScope(customContext, "profiles", "delete")).toBe(
				"own",
			);
		});

		it("returns 'all' when action not found in permissions (default)", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			expect(getActionScope(customContext, "profiles", "update")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "contacts", "read")).toBe(
				"all",
			);
		});

		it("parses mixed permissions (some all, some own)", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "manager" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["create", "read", "update:own", "delete:own"],
					contacts: ["read:own", "update:own"],
				},
			};

			expect(getActionScope(customContext, "profiles", "create")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "profiles", "read")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "profiles", "update")).toBe(
				"own",
			);
			expect(getActionScope(customContext, "profiles", "delete")).toBe(
				"own",
			);
			expect(getActionScope(customContext, "contacts", "read")).toBe(
				"own",
			);
			expect(getActionScope(customContext, "contacts", "update")).toBe(
				"own",
			);
		});

		it("returns 'all' when rolePermissions is undefined", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
			};

			expect(getActionScope(customContext, "profiles", "update")).toBe(
				"all",
			);
		});

		it("returns 'all' when resource not in rolePermissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			expect(getActionScope(customContext, "contacts", "read")).toBe(
				"all",
			);
			expect(getActionScope(customContext, "webhooks", "create")).toBe(
				"all",
			);
		});
	});
});

describe("hasPermission", () => {
	describe("without ownership parameter", () => {
		it("returns true when scope is 'all'", () => {
			const ownerContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "owner",
			};

			expect(hasPermission(ownerContext, "profiles", "update")).toBe(
				true,
			);
			expect(hasPermission(ownerContext, "profiles", "delete")).toBe(
				true,
			);
		});

		it("returns false when scope is 'own' (no ownership provided)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			// Member has 'own' scope for apiKeys/read (the only restricted action)
			expect(hasPermission(memberContext, "apiKeys", "read")).toBe(false);
		});
	});

	describe("with ownership parameter", () => {
		it("returns true when scope is 'all' (ownership ignored)", () => {
			const ownerContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "owner",
			};

			expect(
				hasPermission(ownerContext, "profiles", "update", {
					resourceCreatedById: "other-user",
				}),
			).toBe(true);
		});

		it("returns true when scope is 'own' and user owns resource", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				hasPermission(memberContext, "apiKeys", "read", {
					resourceCreatedById: "user-123",
				}),
			).toBe(true);
		});

		it("returns false when scope is 'own' and user does not own resource", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				hasPermission(memberContext, "apiKeys", "read", {
					resourceCreatedById: "other-user",
				}),
			).toBe(false);
		});

		it("returns false when resourceCreatedById is null", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				hasPermission(memberContext, "apiKeys", "read", {
					resourceCreatedById: null,
				}),
			).toBe(false);
		});

		it("returns false when resourceCreatedById is undefined", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				hasPermission(memberContext, "apiKeys", "read", {
					resourceCreatedById: undefined,
				}),
			).toBe(false);
		});
	});

	describe("role-specific behavior", () => {
		it("owner always has permission (all scope)", () => {
			const ownerContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "owner",
			};

			expect(hasPermission(ownerContext, "profiles", "update")).toBe(
				true,
			);
			expect(hasPermission(ownerContext, "profiles", "delete")).toBe(
				true,
			);
			expect(hasPermission(ownerContext, "contacts", "delete")).toBe(
				true,
			);
			expect(hasPermission(ownerContext, "webhooks", "delete")).toBe(
				true,
			);
		});

		it("admin always has permission (all scope)", () => {
			const adminContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "admin",
			};

			expect(hasPermission(adminContext, "profiles", "update")).toBe(
				true,
			);
			expect(hasPermission(adminContext, "profiles", "delete")).toBe(
				true,
			);
			expect(hasPermission(adminContext, "contacts", "delete")).toBe(
				true,
			);
		});

		it("member with own scope needs ownership check (apiKeys/read)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			// Without ownership - fails
			expect(hasPermission(memberContext, "apiKeys", "read")).toBe(false);

			// With matching ownership - succeeds
			expect(
				hasPermission(memberContext, "apiKeys", "read", {
					resourceCreatedById: "user-123",
				}),
			).toBe(true);

			// With non-matching ownership - fails
			expect(
				hasPermission(memberContext, "apiKeys", "read", {
					resourceCreatedById: "other-user",
				}),
			).toBe(false);
		});

		it("custom role with own scope needs ownership check", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update:own", "delete:own"],
				},
			};

			// Read has 'all' scope - succeeds without ownership
			expect(hasPermission(customContext, "profiles", "read")).toBe(true);

			// Update has 'own' scope - needs ownership
			expect(hasPermission(customContext, "profiles", "update")).toBe(
				false,
			);
			expect(
				hasPermission(customContext, "profiles", "update", {
					resourceCreatedById: "user-123",
				}),
			).toBe(true);
			expect(
				hasPermission(customContext, "profiles", "update", {
					resourceCreatedById: "other-user",
				}),
			).toBe(false);
		});

		it("custom role with all scope grants permission without ownership", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update", "delete"],
				},
			};

			expect(hasPermission(customContext, "profiles", "read")).toBe(true);
			expect(hasPermission(customContext, "profiles", "update")).toBe(
				true,
			);
			expect(hasPermission(customContext, "profiles", "delete")).toBe(
				true,
			);
		});
	});

	describe("edge cases", () => {
		it("member cannot read all apiKeys (read is restricted to own)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			// apiKeys/read without ownership info returns false (scope is "own")
			expect(hasPermission(memberContext, "apiKeys", "read")).toBe(false);
			// Unrestricted resources return true
			expect(hasPermission(memberContext, "profiles", "read")).toBe(true);
			expect(hasPermission(memberContext, "contacts", "read")).toBe(true);
		});

		it("custom role without any permissions is denied all access", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "viewer" as "owner" | "admin" | "member",
				rolePermissions: {},
			};

			expect(hasPermission(customContext, "profiles", "read")).toBe(
				false,
			);
			expect(hasPermission(customContext, "profiles", "update")).toBe(
				false,
			);
			expect(hasPermission(customContext, "contacts", "read")).toBe(
				false,
			);
			expect(hasPermission(customContext, "webhooks", "create")).toBe(
				false,
			);
		});

		it("custom role with undefined rolePermissions is denied all access", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "viewer" as "owner" | "admin" | "member",
			};

			expect(hasPermission(customContext, "profiles", "read")).toBe(
				false,
			);
			expect(hasPermission(customContext, "contacts", "create")).toBe(
				false,
			);
		});

		it("custom role with partial permissions only has those specific permissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "profile-viewer" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			// Has read permission for profiles
			expect(hasPermission(customContext, "profiles", "read")).toBe(true);
			// Does NOT have update/delete for profiles
			expect(hasPermission(customContext, "profiles", "update")).toBe(
				false,
			);
			expect(hasPermission(customContext, "profiles", "delete")).toBe(
				false,
			);
			// Does NOT have any permission for other resources
			expect(hasPermission(customContext, "contacts", "read")).toBe(
				false,
			);
			expect(hasPermission(customContext, "webhooks", "create")).toBe(
				false,
			);
		});
	});
});

describe("verifyPermission", () => {
	it("does not throw when hasPermission returns true", () => {
		const ownerContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "owner",
		};

		expect(() => {
			verifyPermission(ownerContext, "profiles", "update");
		}).not.toThrow();
	});

	it("throws ORPCError with FORBIDDEN code when permission denied", () => {
		const memberContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "member",
		};

		// apiKeys/read is "own" scope, so fails without ownership
		expect(() => {
			verifyPermission(memberContext, "apiKeys", "read");
		}).toThrow(ORPCError);

		try {
			verifyPermission(memberContext, "apiKeys", "read");
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
			expect((error as ORPCError).code).toBe("FORBIDDEN");
		}
	});

	it("includes resource and action in error message", () => {
		const memberContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "member",
		};

		try {
			verifyPermission(memberContext, "apiKeys", "read");
		} catch (error) {
			expect((error as ORPCError).message).toContain("read");
			expect((error as ORPCError).message).toContain("apiKeys");
		}
	});

	it("passes ownership to hasPermission", () => {
		const memberContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "member",
		};

		// Should not throw when ownership matches (apiKeys/read is "own" scope)
		expect(() => {
			verifyPermission(memberContext, "apiKeys", "read", {
				resourceCreatedById: "user-123",
			});
		}).not.toThrow();

		// Should throw when ownership does not match
		expect(() => {
			verifyPermission(memberContext, "apiKeys", "read", {
				resourceCreatedById: "other-user",
			});
		}).toThrow(ORPCError);
	});

	it("works with custom roles", () => {
		const customContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "editor" as "owner" | "admin" | "member",
			rolePermissions: {
				profiles: ["read", "update:own"],
			},
		};

		// Read has 'all' scope - should not throw
		expect(() => {
			verifyPermission(customContext, "profiles", "read");
		}).not.toThrow();

		// Update has 'own' scope - should throw without ownership
		expect(() => {
			verifyPermission(customContext, "profiles", "update");
		}).toThrow(ORPCError);

		// Update with matching ownership - should not throw
		expect(() => {
			verifyPermission(customContext, "profiles", "update", {
				resourceCreatedById: "user-123",
			});
		}).not.toThrow();
	});

	it("throws FORBIDDEN for custom roles without permission", () => {
		const customContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "viewer" as "owner" | "admin" | "member",
			rolePermissions: {},
		};

		expect(() => {
			verifyPermission(customContext, "profiles", "read");
		}).toThrow(ORPCError);

		expect(() => {
			verifyPermission(customContext, "contacts", "create");
		}).toThrow(ORPCError);
	});

	it("throws FORBIDDEN for custom roles with undefined rolePermissions", () => {
		const customContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "viewer" as "owner" | "admin" | "member",
		};

		expect(() => {
			verifyPermission(customContext, "profiles", "read");
		}).toThrow(ORPCError);
	});
});

describe("getOwnershipFilter", () => {
	describe("returns undefined (no filter)", () => {
		it("for owner role", () => {
			const ownerContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "owner",
			};

			expect(
				getOwnershipFilter(ownerContext, "profiles", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(ownerContext, "profiles", "update"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(ownerContext, "contacts", "delete"),
			).toBeUndefined();
		});

		it("for admin role", () => {
			const adminContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "admin",
			};

			expect(
				getOwnershipFilter(adminContext, "profiles", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(adminContext, "profiles", "update"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(adminContext, "contacts", "delete"),
			).toBeUndefined();
		});

		it("for member with 'all' scope action (unrestricted resources)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			// profiles and contacts are not restricted for member
			expect(
				getOwnershipFilter(memberContext, "profiles", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(memberContext, "contacts", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(memberContext, "apiKeys", "create"),
			).toBeUndefined();
		});

		it("for custom role with 'all' scope", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update", "delete"],
				},
			};

			expect(
				getOwnershipFilter(customContext, "profiles", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(customContext, "profiles", "update"),
			).toBeUndefined();
		});
	});

	describe("returns ownership filter", () => {
		it("for member with 'own' scope action (uses default 'createdById' field)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			// apiKeys/read has 'own' scope for member
			expect(
				getOwnershipFilter(memberContext, "apiKeys", "read"),
			).toEqual({
				createdById: "user-123",
			});
		});

		it("for custom role with 'own' scope", () => {
			const customContext: PermissionContext = {
				userId: "user-456",
				organizationId: "org-789",
				memberRole: "editor" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read", "update:own", "delete:own"],
				},
			};

			expect(
				getOwnershipFilter(customContext, "profiles", "update"),
			).toEqual({
				createdById: "user-456",
			});

			expect(
				getOwnershipFilter(customContext, "profiles", "delete"),
			).toEqual({
				createdById: "user-456",
			});
		});

		it("uses custom field name when provided", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				getOwnershipFilter(memberContext, "apiKeys", "read", "userId"),
			).toEqual({
				userId: "user-123",
			});
		});
	});

	describe("apiKeys specific cases", () => {
		it("member has 'own' scope for apiKeys/read", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				getOwnershipFilter(memberContext, "apiKeys", "read"),
			).toEqual({
				createdById: "user-123",
			});
		});

		it("member has 'all' scope for apiKeys/delete", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			expect(
				getOwnershipFilter(memberContext, "apiKeys", "delete"),
			).toBeUndefined();
		});
	});

	describe("contacts specific cases", () => {
		it("member has 'all' scope for contacts (no restrictions)", () => {
			const memberContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "member",
			};

			// contacts is not in MEMBER_SCOPE_RESTRICTIONS, so all actions are "all" scope
			expect(
				getOwnershipFilter(memberContext, "contacts", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(memberContext, "contacts", "update"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(memberContext, "contacts", "delete"),
			).toBeUndefined();
		});
	});

	describe("returns no-access filter for custom roles without permission", () => {
		it("returns no-access filter when rolePermissions is undefined", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "viewer" as "owner" | "admin" | "member",
			};

			expect(
				getOwnershipFilter(customContext, "profiles", "read"),
			).toEqual({
				createdById: "__no_access__",
			});
		});

		it("returns no-access filter when rolePermissions is empty object", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "viewer" as "owner" | "admin" | "member",
				rolePermissions: {},
			};

			expect(
				getOwnershipFilter(customContext, "profiles", "read"),
			).toEqual({
				createdById: "__no_access__",
			});
		});

		it("returns no-access filter when resource not in rolePermissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "profile-only" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			// Has profiles:read, but not contacts:read
			expect(
				getOwnershipFilter(customContext, "profiles", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(customContext, "contacts", "read"),
			).toEqual({
				createdById: "__no_access__",
			});
		});

		it("returns no-access filter when action not in rolePermissions", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "reader" as "owner" | "admin" | "member",
				rolePermissions: {
					profiles: ["read"],
				},
			};

			// Has profiles:read, but not profiles:update
			expect(
				getOwnershipFilter(customContext, "profiles", "read"),
			).toBeUndefined();
			expect(
				getOwnershipFilter(customContext, "profiles", "update"),
			).toEqual({
				createdById: "__no_access__",
			});
		});

		it("uses custom field name for no-access filter", () => {
			const customContext: PermissionContext = {
				userId: "user-123",
				organizationId: "org-456",
				memberRole: "viewer" as "owner" | "admin" | "member",
				rolePermissions: {},
			};

			expect(
				getOwnershipFilter(
					customContext,
					"profiles",
					"read",
					"ownerId",
				),
			).toEqual({
				ownerId: "__no_access__",
			});
		});
	});
});

describe("isResourceOwner", () => {
	const context: PermissionContext = {
		userId: "user-123",
		organizationId: "org-456",
		memberRole: "member",
	};

	it("returns true when resourceCreatedById matches userId", () => {
		expect(isResourceOwner(context, "user-123")).toBe(true);
	});

	it("returns false when resourceCreatedById does not match userId", () => {
		expect(isResourceOwner(context, "other-user")).toBe(false);
	});

	it("returns false when resourceCreatedById is null", () => {
		expect(isResourceOwner(context, null)).toBe(false);
	});

	it("returns false when resourceCreatedById is undefined", () => {
		expect(isResourceOwner(context, undefined)).toBe(false);
	});

	it("returns false when resourceCreatedById is empty string", () => {
		expect(isResourceOwner(context, "")).toBe(false);
	});

	it("is case-sensitive", () => {
		expect(isResourceOwner(context, "User-123")).toBe(false);
		expect(isResourceOwner(context, "USER-123")).toBe(false);
	});
});

describe("isAdmin", () => {
	it("returns true for owner role", () => {
		const ownerContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "owner",
		};

		expect(isAdmin(ownerContext)).toBe(true);
	});

	it("returns true for admin role", () => {
		const adminContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "admin",
		};

		expect(isAdmin(adminContext)).toBe(true);
	});

	it("returns false for member role", () => {
		const memberContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "member",
		};

		expect(isAdmin(memberContext)).toBe(false);
	});

	it("returns false for custom role", () => {
		const customContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "editor" as "owner" | "admin" | "member",
			rolePermissions: {
				profiles: ["read", "update", "delete"],
			},
		};

		expect(isAdmin(customContext)).toBe(false);
	});

	it("returns false for empty role", () => {
		const emptyRoleContext: PermissionContext = {
			userId: "user-123",
			organizationId: "org-456",
			memberRole: "" as "owner" | "admin" | "member",
		};

		expect(isAdmin(emptyRoleContext)).toBe(false);
	});
});

import { ac } from "./access-control";

/**
 * Raw permission definitions for system roles.
 * These are used both for creating Better Auth roles and for UI display.
 */
export const SYSTEM_ROLE_PERMISSIONS = {
	owner: {
		// Organization management
		organization: ["update", "delete"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		ac: ["create", "read", "update", "delete"],
		// AI & Monitoring - full access
		aiAgents: ["create", "read", "update", "delete"],
		watchers: ["create", "read", "update", "delete"],
		// ISP Management - full access
		customers: ["create", "read", "update", "delete", "import", "export"],
		servicePlans: ["create", "read", "update", "delete"],
		stations: ["create", "read", "update", "delete"],
		accessPoints: ["create", "read", "update", "delete"],
		employees: [
			"create",
			"read",
			"update",
			"delete",
			"import",
			"export",
			"assign",
		],
		tasks: ["create", "read", "update", "delete", "assign"],
		dealers: ["create", "read", "update", "delete"],
		inventory: ["create", "read", "update", "delete"],
		installations: ["create", "read", "update", "approve"],
		// Integrations - full access
		webhooks: ["create", "read", "update", "delete"],
		apiKeys: ["create", "read", "delete"],
		connections: ["create", "read", "update", "delete", "sync"],
		// Insights - full access
		audit: ["view"],
		// Billing
		billing: ["view", "manage", "collect"],
	},
	admin: {
		// Organization management (cannot delete)
		organization: ["update"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		ac: ["create", "read", "update", "delete"],
		// AI & Monitoring - full access
		aiAgents: ["create", "read", "update", "delete"],
		watchers: ["create", "read", "update", "delete"],
		// ISP Management - full access
		customers: ["create", "read", "update", "delete", "import", "export"],
		servicePlans: ["create", "read", "update", "delete"],
		stations: ["create", "read", "update", "delete"],
		accessPoints: ["create", "read", "update", "delete"],
		employees: [
			"create",
			"read",
			"update",
			"delete",
			"import",
			"export",
			"assign",
		],
		tasks: ["create", "read", "update", "delete", "assign"],
		dealers: ["create", "read", "update", "delete"],
		inventory: ["create", "read", "update", "delete"],
		installations: ["create", "read", "update", "approve"],
		// Integrations - full access
		webhooks: ["create", "read", "update", "delete"],
		apiKeys: ["create", "read", "delete"],
		connections: ["create", "read", "update", "delete", "sync"],
		// Insights - full access
		audit: ["view"],
		// Billing
		billing: ["view", "manage", "collect"],
	},
	member: {
		// AI & Monitoring - read only
		aiAgents: ["read"],
		watchers: ["read"],
		// ISP Management - read only
		customers: ["read"],
		servicePlans: ["read"],
		stations: ["read"],
		accessPoints: ["read"],
		employees: ["read"],
		tasks: ["read"],
		dealers: ["read"],
		// Integrations - read only own
		apiKeys: ["read:own"],
		connections: ["read"],
	},
} as const;

/**
 * Owner role - Full access to everything.
 * The organization creator automatically gets this role.
 */
export const owner = ac.newRole({
	// Organization management
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	ac: ["create", "read", "update", "delete"],
	// AI & Monitoring - full access
	aiAgents: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
	],
	watchers: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
	],
	// ISP Management - full access
	customers: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
		"import",
		"export",
	],
	servicePlans: ["create", "read", "update", "delete"],
	stations: ["create", "read", "update", "delete"],
	accessPoints: ["create", "read", "update", "delete"],
	employees: [
		"create",
		"read",
		"update",
		"delete",
		"import",
		"export",
		"assign",
	],
	tasks: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
		"assign",
	],
	dealers: ["create", "read", "update", "delete"],
	inventory: ["create", "read", "update", "delete"],
	installations: ["create", "read", "update", "approve"],
	// Integrations - full access
	webhooks: ["create", "read", "update", "delete"],
	apiKeys: ["create", "read", "read:own", "delete", "delete:own"],
	connections: ["create", "read", "update", "delete", "sync"],
	// Insights - full access
	audit: ["view"],
	// Billing
	billing: ["view", "manage", "collect", "collect:own"],
});

/**
 * Admin role - Full access except organization deletion.
 * Can manage members, roles, and all features.
 */
export const admin = ac.newRole({
	// Organization management (cannot delete)
	organization: ["update"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	ac: ["create", "read", "update", "delete"],
	// AI & Monitoring - full access
	aiAgents: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
	],
	watchers: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
	],
	// ISP Management - full access
	customers: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
		"import",
		"export",
	],
	servicePlans: ["create", "read", "update", "delete"],
	stations: ["create", "read", "update", "delete"],
	accessPoints: ["create", "read", "update", "delete"],
	employees: [
		"create",
		"read",
		"update",
		"delete",
		"import",
		"export",
		"assign",
	],
	tasks: [
		"create",
		"read",
		"read:own",
		"update",
		"update:own",
		"delete",
		"delete:own",
		"assign",
	],
	dealers: ["create", "read", "update", "delete"],
	inventory: ["create", "read", "update", "delete"],
	installations: ["create", "read", "update", "approve"],
	// Integrations - full access
	webhooks: ["create", "read", "update", "delete"],
	apiKeys: ["create", "read", "read:own", "delete", "delete:own"],
	connections: ["create", "read", "update", "delete", "sync"],
	// Insights - full access
	audit: ["view"],
	// Billing
	billing: ["view", "manage", "collect", "collect:own"],
});

/**
 * Member role - Basic access with "own only" restrictions.
 * Members get base permissions but ownership is enforced at API level
 * via MEMBER_SCOPE_RESTRICTIONS for update/delete operations.
 */
export const member = ac.newRole({
	// AI & Monitoring - read only
	aiAgents: ["read"],
	watchers: ["read"],
	// ISP Management - read only
	customers: ["read"],
	servicePlans: ["read"],
	stations: ["read"],
	accessPoints: ["read"],
	employees: ["read"],
	tasks: ["read"],
	dealers: ["read"],
	// Integrations - read only
	apiKeys: ["read", "read:own"],
	connections: ["read"],
});

/**
 * Scope restrictions for system member role.
 * Defines which actions require ownership verification at API level.
 * Actions listed here with "own" scope can only be performed on resources
 * where resource.createdById === user.id
 *
 * For custom roles, scope is stored in the permission JSON as "action:own"
 * (e.g., ["create", "read:own", "update:own", "delete:own"])
 */
export const MEMBER_SCOPE_RESTRICTIONS: Record<
	string,
	Record<string, "own">
> = {
	apiKeys: {
		read: "own",
	},
};

/**
 * Get scope for a specific action on a system role.
 * Returns "own" if restricted, "all" otherwise.
 */
export function getSystemRoleScope(
	role: string,
	resource: string,
	action: string,
): "all" | "own" {
	// Only member role has scope restrictions among system roles
	if (role === "member") {
		const restrictions = MEMBER_SCOPE_RESTRICTIONS[resource];
		if (restrictions?.[action] === "own") {
			return "own";
		}
	}
	return "all";
}

/**
 * System roles that cannot be deleted by users.
 * These are the default roles available in all organizations.
 */
export const SYSTEM_ROLES = ["owner", "admin", "member"] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/**
 * Check if a role name is a protected system role.
 */
export function isSystemRole(role: string): role is SystemRole {
	return SYSTEM_ROLES.includes(role as SystemRole);
}

/**
 * System role configurations for reference.
 * Maps role names to their role objects.
 */
export const systemRoles = {
	owner,
	admin,
	member,
} as const;

/**
 * Get permissions for a system role in the standard PermissionRecord format.
 * This allows the UI to display system role permissions consistently with custom roles.
 */
export function getSystemRolePermissions(
	role: SystemRole,
): Record<string, string[]> {
	const permissions = SYSTEM_ROLE_PERMISSIONS[role];
	// Convert readonly arrays to mutable for PermissionRecord compatibility
	const result: Record<string, string[]> = {};
	for (const [resource, actions] of Object.entries(permissions)) {
		result[resource] = [...actions];
	}
	return result;
}

// ─── ISP Role Templates ─────────────────────────────────────────

/**
 * Pre-defined role templates for ISP staff.
 * Used when inviting employees/dealers to create their organization role.
 * Admins can customize permissions after creation via the role management UI.
 */
export const ISP_ROLE_TEMPLATES = {
	collector: {
		label: "Collector",
		description:
			"Field payment collector — sees assigned customers, records payments",
		permissions: {
			customers: ["read:own"],
			billing: ["view", "collect:own"],
			tasks: ["read:own"],
		},
	},
	field_tech: {
		label: "Field Technician",
		description: "Field worker — manages installations, stock, and tasks",
		permissions: {
			customers: ["read"],
			tasks: ["create", "read:own", "update:own"],
			inventory: ["read", "update"],
			installations: ["create", "read", "update"],
			stations: ["read"],
		},
	},
	dealer: {
		label: "Dealer",
		description: "Reseller — views own customers, plans, and own account",
		permissions: {
			customers: ["read:own"],
			servicePlans: ["read"],
			billing: ["view"],
		},
	},
	manager: {
		label: "Manager",
		description:
			"ISP manager — full ISP management without org admin privileges",
		permissions: {
			customers: [
				"create",
				"read",
				"update",
				"delete",
				"import",
				"export",
			],
			employees: ["read", "update"],
			servicePlans: ["read", "update"],
			stations: ["read", "update"],
			accessPoints: ["read", "update"],
			tasks: ["create", "read", "update", "delete", "assign"],
			dealers: ["read"],
			billing: ["view", "manage", "collect"],
			inventory: ["create", "read", "update", "delete"],
			installations: ["create", "read", "update", "approve"],
			audit: ["view"],
		},
	},
} as const;

export type IspRoleTemplate = keyof typeof ISP_ROLE_TEMPLATES;

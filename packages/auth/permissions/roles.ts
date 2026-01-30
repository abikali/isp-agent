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
		// Integrations - full access
		webhooks: ["create", "read", "update", "delete"],
		apiKeys: ["create", "read", "delete"],
		connections: ["create", "read", "update", "delete", "sync"],
		// Insights - full access
		audit: ["view"],
		// Billing
		billing: ["view", "manage"],
	},
	admin: {
		// Organization management (cannot delete)
		organization: ["update"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		ac: ["create", "read", "update", "delete"],
		// Integrations - full access
		webhooks: ["create", "read", "update", "delete"],
		apiKeys: ["create", "read", "delete"],
		connections: ["create", "read", "update", "delete", "sync"],
		// Insights - full access
		audit: ["view"],
		// Billing
		billing: ["view", "manage"],
	},
	member: {
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
	// Integrations - full access
	webhooks: ["create", "read", "update", "delete"],
	apiKeys: ["create", "read", "read:own", "delete", "delete:own"],
	connections: ["create", "read", "update", "delete", "sync"],
	// Insights - full access
	audit: ["view"],
	// Billing
	billing: ["view", "manage"],
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
	// Integrations - full access
	webhooks: ["create", "read", "update", "delete"],
	apiKeys: ["create", "read", "read:own", "delete", "delete:own"],
	connections: ["create", "read", "update", "delete", "sync"],
	// Insights - full access
	audit: ["view"],
	// Billing
	billing: ["view", "manage"],
});

/**
 * Member role - Basic access with "own only" restrictions.
 * Members get base permissions but ownership is enforced at API level
 * via MEMBER_SCOPE_RESTRICTIONS for update/delete operations.
 */
export const member = ac.newRole({
	// Integrations - read only
	apiKeys: ["read"],
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

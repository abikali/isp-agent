import { createAccessControl } from "better-auth/plugins/access";

/**
 * Permission statement defining all resources and their available actions.
 * This is the single source of truth for permissions in the application.
 *
 * To add new permissions:
 * 1. Add the resource and its actions here
 * 2. Update system roles in roles.ts as needed
 * 3. Add UI translations for the new resource
 */
export const permissionStatement = {
	// Organization management (Better Auth defaults)
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	// Access control permissions for role management
	ac: ["create", "read", "update", "delete"],

	// Integrations
	webhooks: ["create", "read", "update", "delete"],
	apiKeys: ["create", "read", "read:own", "delete", "delete:own"],
	connections: ["create", "read", "update", "delete", "sync"],

	// Insights
	audit: ["view"],

	// Billing
	billing: ["view", "manage"],
} as const;

/**
 * Resources that support ownership-based permissions.
 * For these resources, members may have "own only" restrictions
 * where they can only modify resources they created.
 */
export const OWNERSHIP_RESOURCES = ["apiKeys"] as const;
export type OwnershipResource = (typeof OWNERSHIP_RESOURCES)[number];

/**
 * Actions that support "all" vs "only his" scope per ownership resource.
 * Not all actions need scope - e.g., "create" always creates your own.
 */
export const SCOPED_ACTIONS: Record<OwnershipResource, readonly string[]> = {
	apiKeys: ["read", "delete"],
} as const;

/**
 * Check if an action supports scope configuration for a resource.
 */
export function isActionScoped(resource: string, action: string): boolean {
	const scoped = SCOPED_ACTIONS[resource as OwnershipResource];
	return scoped?.includes(action) ?? false;
}

/**
 * Parse action string to get base action and scope.
 * "read" → { action: "read", scope: "all" }
 * "read:own" → { action: "read", scope: "own" }
 */
export function parseAction(actionStr: string): {
	action: string;
	scope: "all" | "own";
} {
	if (actionStr.endsWith(":own")) {
		return { action: actionStr.slice(0, -4), scope: "own" };
	}
	return { action: actionStr, scope: "all" };
}

/**
 * Format action with scope.
 * ("read", "own") → "read:own"
 * ("read", "all") → "read"
 */
export function formatAction(action: string, scope: "all" | "own"): string {
	return scope === "own" ? `${action}:own` : action;
}

export const ac = createAccessControl(permissionStatement);

// Type exports for use throughout the app
export type PermissionStatement = typeof permissionStatement;
export type PermissionResource = keyof PermissionStatement;
export type PermissionAction<R extends PermissionResource> =
	PermissionStatement[R][number];

// Helper type for permission records
export type PermissionRecord = {
	[R in PermissionResource]?: PermissionAction<R>[];
};

/**
 * Permission groups for UI organization.
 * Used by RolePermissionsGrid to group permissions by category.
 */
export const PERMISSION_GROUPS = {
	organization: {
		resources: ["organization", "member", "invitation", "ac"] as const,
		label: "Organization",
	},
	integrations: {
		resources: ["webhooks", "apiKeys", "connections"] as const,
		label: "Integrations",
	},
	insights: {
		resources: ["audit"] as const,
		label: "Insights",
	},
	billing: {
		resources: ["billing"] as const,
		label: "Billing",
	},
} as const;

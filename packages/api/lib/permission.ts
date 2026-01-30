import { ORPCError } from "@orpc/server";
import {
	getSystemRoleScope,
	isSystemRole,
	parseAction,
} from "@repo/auth/permissions";
import type { MemberRole } from "./membership";

/**
 * Context for permission checks.
 * Contains user and organization information needed for authorization.
 */
export interface PermissionContext {
	userId: string;
	organizationId: string;
	memberRole: MemberRole;
	/**
	 * Role permissions for custom roles (parsed from DB JSON).
	 * For system roles, this is optional as we use built-in definitions.
	 */
	rolePermissions?: Record<string, string[]> | undefined;
}

/**
 * Create a permission context from membership check result.
 */
export function getPermissionContext(
	userId: string,
	organizationId: string,
	memberRole: string,
	rolePermissions?: Record<string, string[]>,
): PermissionContext {
	return {
		userId,
		organizationId,
		memberRole: memberRole as MemberRole,
		rolePermissions,
	};
}

/**
 * Check if a custom role has a specific action for a resource.
 * For system roles, this always returns true (system roles have fixed permissions).
 *
 * @param context - Permission context with role info
 * @param resource - Resource being accessed (e.g., "profiles")
 * @param action - Action being performed (e.g., "read")
 * @returns true if the role has the action, false otherwise
 */
export function hasActionInRole(
	context: PermissionContext,
	resource: string,
	action: string,
): boolean {
	const { memberRole, rolePermissions } = context;

	// System roles always have their permissions defined
	if (isSystemRole(memberRole)) {
		return true; // System role permission is handled by getSystemRoleScope
	}

	// For custom roles, check if the action exists in rolePermissions
	if (!rolePermissions) {
		return false; // No permissions = no access
	}

	const actions = rolePermissions[resource];
	if (!actions) {
		return false; // Resource not in permissions = no access
	}

	// Check if the action (with or without :own suffix) exists
	return actions.some((a) => {
		const { action: baseAction } = parseAction(a);
		return baseAction === action;
	});
}

/**
 * Get the scope for an action based on role configuration.
 *
 * For system roles: uses getSystemRoleScope (checks MEMBER_SCOPE_RESTRICTIONS)
 * For custom roles: parses :own suffix from stored permissions
 *
 * @returns "own" if action is restricted to own resources, "all" otherwise
 */
export function getActionScope(
	context: PermissionContext,
	resource: string,
	action: string,
): "all" | "own" {
	const { memberRole, rolePermissions } = context;

	// Owners and admins always have "all" scope
	if (memberRole === "owner" || memberRole === "admin") {
		return "all";
	}

	// For system roles, use built-in scope definitions
	if (isSystemRole(memberRole)) {
		return getSystemRoleScope(memberRole, resource, action);
	}

	// For custom roles, parse scope from stored permissions
	if (rolePermissions) {
		const actions = rolePermissions[resource] ?? [];
		const matchingAction = actions.find((a) => {
			const { action: baseAction } = parseAction(a);
			return baseAction === action;
		});

		if (matchingAction) {
			const { scope } = parseAction(matchingAction);
			return scope;
		}
	}

	// Default to "all" if no specific scope found
	return "all";
}

/**
 * Check if user has permission for an action, considering ownership scope.
 *
 * - First checks if the role has this permission at all
 * - Owners and admins always have full access
 * - For system member role: checks MEMBER_SCOPE_RESTRICTIONS
 * - For custom roles: parses :own suffix from rolePermissions
 * - If action is restricted to "own", ownership must be verified
 *
 * @param context - Permission context with user info
 * @param resource - Resource being accessed (e.g., "profiles")
 * @param action - Action being performed (e.g., "delete")
 * @param ownership - Optional ownership info for scope checking
 * @returns true if permitted, false otherwise
 */
export function hasPermission(
	context: PermissionContext,
	resource: string,
	action: string,
	ownership?: { resourceCreatedById: string | null | undefined },
): boolean {
	const { userId } = context;

	// First check if the role has this permission at all
	if (!hasActionInRole(context, resource, action)) {
		return false;
	}

	// Get scope for this action
	const scope = getActionScope(context, resource, action);

	// If scope is "all", permission granted
	if (scope === "all") {
		return true;
	}

	// Scope is "own" - verify ownership
	if (ownership) {
		return ownership.resourceCreatedById === userId;
	}

	// Action is restricted but no ownership info provided
	return false;
}

/**
 * Verify permission and throw FORBIDDEN error if denied.
 *
 * @throws ORPCError with FORBIDDEN code if permission denied
 */
export function verifyPermission(
	context: PermissionContext,
	resource: string,
	action: string,
	ownership?: { resourceCreatedById: string | null | undefined },
): void {
	if (!hasPermission(context, resource, action, ownership)) {
		throw new ORPCError("FORBIDDEN", {
			message: `You don't have permission to ${action} this ${resource}`,
		});
	}
}

/**
 * Get ownership filter for Prisma queries based on role scope.
 *
 * For roles without permission: Returns filter that matches nothing
 * For admins/owners: Returns undefined (no filter - see all resources)
 * For "all" scope: Returns undefined (see all resources)
 * For "own" scope: Returns filter to only show owned resources
 *
 * Use this in list operations to automatically scope results based on role.
 *
 * @example
 * const filter = getOwnershipFilter(permContext, "profiles", "read");
 * const profiles = await db.profile.findMany({
 *   where: { organizationId, ...filter }
 * });
 */
export function getOwnershipFilter(
	context: PermissionContext,
	resource: string,
	action: string,
	field = "createdById",
): Record<string, string> | undefined {
	const { userId } = context;

	// First check if the role has this permission at all
	if (!hasActionInRole(context, resource, action)) {
		// Return a filter that matches nothing (user has no access)
		return { [field]: "__no_access__" };
	}

	// Get scope for this action
	const scope = getActionScope(context, resource, action);

	// If scope is "own", filter to owned resources
	if (scope === "own") {
		return { [field]: userId };
	}

	// No filter for "all" scope
	return undefined;
}

/**
 * Check if the current user owns a resource.
 * Useful for conditional UI or additional business logic.
 */
export function isResourceOwner(
	context: PermissionContext,
	resourceCreatedById: string | null | undefined,
): boolean {
	return resourceCreatedById === context.userId;
}

/**
 * Check if user has admin privileges (owner or admin role).
 */
export function isAdmin(context: PermissionContext): boolean {
	return context.memberRole === "owner" || context.memberRole === "admin";
}

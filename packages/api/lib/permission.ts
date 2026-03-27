import { ORPCError } from "@orpc/server";
import {
	getSystemRoleScope,
	isSystemRole,
	type PermissionResource,
	parseAction,
	SYSTEM_ROLE_PERMISSIONS,
} from "@repo/auth/permissions";
import { db } from "@repo/database";
import {
	isAdminRole,
	type MemberRole,
	verifyOrganizationMembership,
} from "./membership";

/**
 * Prisma filter guaranteed to match zero records.
 * Used when a user has no access to a resource.
 */
const NO_MATCH_FILTER = { id: { in: [] as string[] } } as const;

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
 * Check if a role has a specific action for a resource.
 * For system roles, checks against SYSTEM_ROLE_PERMISSIONS.
 * For custom roles, checks the stored rolePermissions JSON.
 */
export function hasActionInRole(
	context: PermissionContext,
	resource: PermissionResource,
	action: string,
): boolean {
	const { memberRole, rolePermissions } = context;

	// For system roles, check the actual permission definitions
	if (isSystemRole(memberRole)) {
		const perms = SYSTEM_ROLE_PERMISSIONS[memberRole];
		const actions = perms[resource as keyof typeof perms] as
			| readonly string[]
			| undefined;
		if (!actions) {
			return false;
		}
		return actions.some((a) => {
			const { action: baseAction } = parseAction(a);
			return baseAction === action;
		});
	}

	// For custom roles, check if the action exists in rolePermissions
	if (!rolePermissions) {
		return false;
	}

	const actions = rolePermissions[resource];
	if (!actions) {
		return false;
	}

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
	resource: PermissionResource,
	action: string,
): "all" | "own" {
	const { memberRole, rolePermissions } = context;

	// Owners and admins always have "all" scope
	if (isAdminRole(memberRole)) {
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
 */
export function hasPermission(
	context: PermissionContext,
	resource: PermissionResource,
	action: string,
	ownership?: { resourceCreatedById: string | null | undefined },
): boolean {
	const { userId } = context;

	if (!hasActionInRole(context, resource, action)) {
		return false;
	}

	const scope = getActionScope(context, resource, action);

	if (scope === "all") {
		return true;
	}

	// Scope is "own" — if ownership info is provided, verify it.
	// If not provided, return true (user has the base permission;
	// callers enforce scope via getOwnershipFilterAsync or verifyCustomerOwnership).
	if (ownership) {
		return ownership.resourceCreatedById === userId;
	}

	return true;
}

/**
 * Verify permission and throw FORBIDDEN error if denied.
 *
 * @throws ORPCError with FORBIDDEN code if permission denied
 */
export function verifyPermission(
	context: PermissionContext,
	resource: PermissionResource,
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
 * Check if the current user owns a resource.
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
	return isAdminRole(context.memberRole);
}

// ─── Reusable Helpers ─────────────────────────────────────────

/**
 * Verify membership + permission in one call.
 * Returns the member record and permission context for further use.
 *
 * @example
 * const { member, permCtx } = await requirePermission(orgId, user.id, "customers", "create");
 */
export async function requirePermission(
	organizationId: string,
	userId: string,
	resource: PermissionResource,
	action: string,
) {
	const member = await verifyOrganizationMembership(organizationId, userId);
	if (!member) {
		throw new ORPCError("FORBIDDEN", {
			message: "You must be a member of this organization",
		});
	}
	const permCtx = getPermissionContext(
		userId,
		organizationId,
		member.role,
		member.rolePermissions,
	);
	verifyPermission(permCtx, resource, action);
	return { member, permCtx };
}

/**
 * Get the user's employee ID in an organization.
 * Returns null if the user has no employee record.
 */
export async function getUserEmployeeId(
	organizationId: string,
	userId: string,
): Promise<string | null> {
	const emp = await db.employee.findFirst({
		where: { organizationId, userId },
		select: { id: true },
	});
	return emp?.id ?? null;
}

/**
 * Get the user's dealer ID in an organization.
 * Returns null if the user has no dealer record.
 */
export async function getUserDealerId(
	organizationId: string,
	userId: string,
): Promise<string | null> {
	const dealer = await db.ispDealer.findFirst({
		where: { organizationId, userId },
		select: { id: true },
	});
	return dealer?.id ?? null;
}

/**
 * Ownership field configuration per resource.
 * Maps resources to their DB ownership field and resolver type.
 *
 * - "userId": field contains the user ID directly (e.g., createdById)
 * - "employeeId": field contains an employee ID (resolve via getUserEmployeeId)
 * - "dealerId": field contains a dealer ID (resolve via getUserDealerId)
 */
export const OWNERSHIP_FIELDS: Partial<
	Record<
		PermissionResource,
		{ field: string; resolver: "userId" | "employeeId" | "dealerId" }
	>
> = {
	apiKeys: { field: "createdById", resolver: "userId" },
	watchers: { field: "createdById", resolver: "userId" },
	aiAgents: { field: "createdById", resolver: "userId" },
	customers: { field: "collectorId", resolver: "employeeId" },
};

/**
 * Get ownership filter for Prisma queries, resolving employee/dealer IDs as needed.
 * Use this for list operations where ownership filtering requires async ID resolution.
 *
 * @example
 * const filter = await getOwnershipFilterAsync(permCtx, "customers", "read");
 * const customers = await db.customer.findMany({ where: { organizationId, ...filter } });
 */
export async function getOwnershipFilterAsync(
	context: PermissionContext,
	resource: PermissionResource,
	action: string,
): Promise<Record<string, unknown> | undefined> {
	const scope = getActionScope(context, resource, action);
	if (scope === "all") {
		return undefined;
	}

	const config = OWNERSHIP_FIELDS[resource];
	if (!config) {
		return { createdById: context.userId };
	}

	if (config.resolver === "userId") {
		return { [config.field]: context.userId };
	}

	if (config.resolver === "employeeId") {
		const empId = await getUserEmployeeId(
			context.organizationId,
			context.userId,
		);
		if (!empId) {
			return NO_MATCH_FILTER;
		}
		return { [config.field]: empId };
	}

	if (config.resolver === "dealerId") {
		const dealerId = await getUserDealerId(
			context.organizationId,
			context.userId,
		);
		if (!dealerId) {
			return NO_MATCH_FILTER;
		}
		return { [config.field]: dealerId };
	}

	return undefined;
}

/**
 * Resolve collector scope for billing:collect permission.
 * Returns the scope and the user's employee ID (if scope is "own").
 *
 * Use in billing procedures that need to filter or verify by collector.
 */
export async function resolveCollectorScope(
	context: PermissionContext,
): Promise<{ scope: "all" | "own"; employeeId: string | null }> {
	const scope = getActionScope(context, "billing", "collect");
	if (scope === "own") {
		const employeeId = await getUserEmployeeId(
			context.organizationId,
			context.userId,
		);
		return { scope, employeeId };
	}
	return { scope, employeeId: null };
}

// ─── Resource-Specific Ownership Helpers ─────────────────────

/**
 * Verify that a user with "own" scope can access a customer.
 * Checks if the user's employee record matches the customer's collectorId.
 * No-op for "all" scope.
 *
 * @param employeeId - Pre-resolved employee ID to avoid a redundant DB query.
 */
export async function verifyCustomerOwnership(
	context: PermissionContext,
	action: string,
	collectorId: string | null | undefined,
	employeeId?: string | null,
): Promise<void> {
	const scope = getActionScope(context, "customers", action);
	if (scope !== "own") {
		return;
	}
	const empId =
		employeeId !== undefined
			? employeeId
			: await getUserEmployeeId(context.organizationId, context.userId);
	if (!empId || collectorId !== empId) {
		throw new ORPCError("FORBIDDEN", {
			message: `You can only ${action} your assigned customers`,
		});
	}
}

/**
 * Verify that a user with "own" scope can access a task.
 * Checks if the user created the task OR their employee is assigned to it.
 * No-op for "all" scope.
 *
 * @param employeeId - Pre-resolved employee ID to avoid a redundant DB query.
 */
export async function verifyTaskOwnership(
	context: PermissionContext,
	action: string,
	task: {
		createdById: string | null;
		assignments?: Array<{
			employeeId?: string;
			employee?: { id: string };
		}>;
	},
	employeeId?: string | null,
): Promise<void> {
	const scope = getActionScope(context, "tasks", action);
	if (scope !== "own") {
		return;
	}
	if (task.createdById === context.userId) {
		return;
	}
	const empId =
		employeeId !== undefined
			? employeeId
			: await getUserEmployeeId(context.organizationId, context.userId);
	const isAssigned = empId
		? (task.assignments ?? []).some(
				(a) => a.employeeId === empId || a.employee?.id === empId,
			)
		: false;
	if (!isAssigned) {
		throw new ORPCError("FORBIDDEN", {
			message: `You can only ${action} your own tasks`,
		});
	}
}

import { isSystemRole } from "@repo/auth/permissions";
import { db } from "@repo/database";

/**
 * Member role types - matches Prisma schema
 */
export type MemberRole = "owner" | "admin" | "member";

/**
 * Fetch role permissions for custom (non-system) roles.
 * Returns undefined for system roles or if permissions not found.
 */
async function fetchRolePermissions(
	organizationId: string,
	role: string,
): Promise<Record<string, string[]> | undefined> {
	if (isSystemRole(role)) {
		return undefined;
	}

	const customRole = await db.organizationRole.findUnique({
		where: {
			organizationId_role: {
				organizationId,
				role,
			},
		},
	});

	if (customRole?.permission) {
		try {
			return JSON.parse(customRole.permission);
		} catch {
			return undefined;
		}
	}

	return undefined;
}

/**
 * Roles that have administrative privileges
 */
export const ADMIN_ROLES: readonly MemberRole[] = ["owner", "admin"] as const;

/**
 * Check if a role has admin privileges
 */
export function isAdminRole(role: MemberRole): boolean {
	return ADMIN_ROLES.includes(role);
}

/**
 * Verify that a user is a member of an organization.
 * Returns the member record with organization details and rolePermissions if found, null otherwise.
 */
export async function verifyOrganizationMembership(
	organizationId: string,
	userId: string,
) {
	const member = await db.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId,
				userId,
			},
		},
		include: {
			organization: true,
		},
	});

	if (!member) {
		return null;
	}

	const rolePermissions = await fetchRolePermissions(
		organizationId,
		member.role,
	);

	return { ...member, rolePermissions };
}

/**
 * Verify that a user is an admin (owner or admin role) of an organization.
 * Returns true if user has admin privileges, false otherwise.
 */
export async function isOrganizationAdmin(
	organizationId: string,
	userId: string,
): Promise<boolean> {
	const member = await verifyOrganizationMembership(organizationId, userId);
	return member ? isAdminRole(member.role as MemberRole) : false;
}

/**
 * Verify that a user is the owner of an organization.
 * Returns true if user is the owner, false otherwise.
 */
export async function isOrganizationOwner(
	organizationId: string,
	userId: string,
): Promise<boolean> {
	const member = await verifyOrganizationMembership(organizationId, userId);
	return member?.role === "owner";
}

/**
 * Check if user is an organization member.
 * Returns the member record if found, null otherwise.
 * Callers should handle the null case (typically throwing FORBIDDEN).
 */
export async function checkOrganizationMembership(
	organizationId: string,
	userId: string,
) {
	const member = await verifyOrganizationMembership(organizationId, userId);
	if (!member) {
		return null;
	}
	return member;
}

/**
 * Check if user is an organization admin (owner or admin role).
 * Returns the member record if user has admin privileges, null otherwise.
 * Callers should handle the null case (typically throwing FORBIDDEN).
 */
export async function checkOrganizationAdmin(
	organizationId: string,
	userId: string,
) {
	const member = await verifyOrganizationMembership(organizationId, userId);
	if (!member || !isAdminRole(member.role as MemberRole)) {
		return null;
	}
	return member;
}

/**
 * Check if user is the organization owner.
 * Returns the member record if user is owner, null otherwise.
 * Callers should handle the null case (typically throwing FORBIDDEN).
 */
export async function checkOrganizationOwner(
	organizationId: string,
	userId: string,
) {
	const member = await verifyOrganizationMembership(organizationId, userId);
	if (!member || member.role !== "owner") {
		return null;
	}
	return member;
}

/**
 * Get user's role in an organization.
 * Returns the role string or null if not a member.
 */
export async function getUserRole(
	organizationId: string,
	userId: string,
): Promise<MemberRole | null> {
	const member = await verifyOrganizationMembership(organizationId, userId);
	return member ? (member.role as MemberRole) : null;
}

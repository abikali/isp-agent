import { isSystemRole } from "@repo/auth/permissions";
import { db } from "@repo/database";

/**
 * Member role types - matches Prisma schema
 */
export type MemberRole = "owner" | "admin" | "member";

/**
 * Short-lived cache for custom role permissions.
 * Avoids repeated DB lookups when multiple API calls from the same
 * user hit the server concurrently (e.g., dashboard loading 5 queries).
 * Entries expire after 5 seconds — enough to deduplicate concurrent
 * requests from the same page load without staling after role edits.
 */
const rolePermissionCache = new Map<
	string,
	{ data: Record<string, string[]> | undefined; expiresAt: number }
>();

const ROLE_CACHE_TTL_MS = 5_000;

/**
 * Fetch role permissions for custom (non-system) roles.
 * Returns undefined for system roles or if permissions not found.
 * Results are cached for 30 seconds to avoid redundant DB queries.
 */
async function fetchRolePermissions(
	organizationId: string,
	role: string,
): Promise<Record<string, string[]> | undefined> {
	if (isSystemRole(role)) {
		return undefined;
	}

	const cacheKey = `${organizationId}:${role}`;
	const cached = rolePermissionCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	const customRole = await db.organizationRole.findUnique({
		where: {
			organizationId_role: {
				organizationId,
				role,
			},
		},
	});

	let result: Record<string, string[]> | undefined;
	if (customRole?.permission) {
		try {
			result = JSON.parse(customRole.permission);
		} catch {
			result = undefined;
		}
	}

	rolePermissionCache.set(cacheKey, {
		data: result,
		expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
	});

	// Lazy cleanup: remove expired entries when cache grows
	if (rolePermissionCache.size > 100) {
		const now = Date.now();
		for (const [key, entry] of rolePermissionCache) {
			if (entry.expiresAt <= now) {
				rolePermissionCache.delete(key);
			}
		}
	}

	return result;
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

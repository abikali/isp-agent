import type { OrganizationMemberRole } from "@repo/auth";

/**
 * Organization member role display names
 */
export const ORGANIZATION_MEMBER_ROLES: Record<OrganizationMemberRole, string> =
	{
		member: "Member",
		owner: "Owner",
		admin: "Admin",
	};

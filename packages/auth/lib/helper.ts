import type { ActiveOrganization, OrganizationMember } from "../types";

/**
 * Check if a user is an admin of the specified organization.
 * This checks organization-level roles only (owner, admin).
 * For global admin checks, use a separate function checking user.role.
 */
export function isOrganizationAdmin(
	organization?: ActiveOrganization | null,
	user?: {
		id: string;
	} | null,
) {
	if (!organization || !user) {
		return false;
	}

	const userOrganizationRole = organization.members.find(
		(member: OrganizationMember) => member.userId === user.id,
	)?.role;

	return ["owner", "admin"].includes(userOrganizationRole ?? "");
}

import { changeMemberPassword } from "./procedures/change-member-password";
import { createLogoUploadUrl } from "./procedures/create-logo-upload-url";
import { generateOrganizationSlug } from "./procedures/generate-organization-slug";
import { getOrganizationIradiusStatus } from "./procedures/get-iradius-status";
import { listOrganizationMembers } from "./procedures/list-members";
import { reassignRoleMembers } from "./procedures/reassign-role-members";

export const organizationsRouter = {
	generateSlug: generateOrganizationSlug,
	createLogoUploadUrl,
	listMembers: listOrganizationMembers,
	changeMemberPassword,
	getIradiusStatus: getOrganizationIradiusStatus,
	reassignRoleMembers,
};

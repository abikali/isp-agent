import { changeMemberPassword } from "./procedures/change-member-password";
import { createLogoUploadUrl } from "./procedures/create-logo-upload-url";
import { generateOrganizationSlug } from "./procedures/generate-organization-slug";
import { listOrganizationMembers } from "./procedures/list-members";

export const organizationsRouter = {
	generateSlug: generateOrganizationSlug,
	createLogoUploadUrl,
	listMembers: listOrganizationMembers,
	changeMemberPassword,
};

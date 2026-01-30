import { config } from "@repo/config";
import {
	ChangeOrganizationNameForm,
	OrganizationLogoForm,
} from "@saas/organizations/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/general",
)({
	head: () => ({
		meta: [{ title: `Organization Settings - ${config.appName}` }],
	}),
	component: OrganizationGeneralSettingsPage,
});

function OrganizationGeneralSettingsPage() {
	return (
		<SettingsList>
			<OrganizationLogoForm />
			<ChangeOrganizationNameForm />
		</SettingsList>
	);
}

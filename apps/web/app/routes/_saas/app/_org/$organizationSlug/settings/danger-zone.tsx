import { config } from "@repo/config";
import { DeleteOrganizationForm } from "@saas/organizations/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/danger-zone",
)({
	head: () => ({
		meta: [{ title: `Danger Zone - ${config.appName}` }],
	}),
	component: OrganizationDangerZonePage,
});

function OrganizationDangerZonePage() {
	return (
		<SettingsList>
			<DeleteOrganizationForm />
		</SettingsList>
	);
}

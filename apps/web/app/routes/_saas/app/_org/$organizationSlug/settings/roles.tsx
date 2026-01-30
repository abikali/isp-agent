import { config } from "@repo/config";
import { RolesBlock, useActiveOrganization } from "@saas/organizations/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/roles",
)({
	head: () => ({
		meta: [{ title: `Roles - ${config.appName}` }],
	}),
	component: OrganizationRolesPage,
});

function OrganizationRolesPage() {
	const { activeOrganization } = useActiveOrganization();

	if (!activeOrganization?.id) {
		return null;
	}

	return (
		<SettingsList>
			<RolesBlock organizationId={activeOrganization.id} />
		</SettingsList>
	);
}

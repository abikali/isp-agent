import { config } from "@repo/config";
import { OrganizationMembersBlock } from "@saas/organizations/components/OrganizationMembersBlock";
import { useActiveOrganization } from "@saas/organizations/hooks/use-active-organization";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/members",
)({
	head: () => ({
		meta: [{ title: `Members - ${config.appName}` }],
	}),
	component: OrganizationMembersPage,
});

function OrganizationMembersPage() {
	const { activeOrganization } = useActiveOrganization();

	if (!activeOrganization?.id) {
		return null;
	}

	return (
		<SettingsList>
			<OrganizationMembersBlock organizationId={activeOrganization.id} />
		</SettingsList>
	);
}

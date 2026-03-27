import { config } from "@repo/config";
import { IRadiusSyncSettings } from "@saas/settings/components/IRadiusSyncSettings";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/iradius",
)({
	head: () => ({
		meta: [{ title: `iRadius Sync - ${config.appName}` }],
	}),
	component: IRadiusSettingsPage,
});

function IRadiusSettingsPage() {
	return (
		<SettingsList>
			<IRadiusSyncSettings />
		</SettingsList>
	);
}

import { config } from "@repo/config";
import { IRadiusSyncSettings } from "@saas/settings/components/IRadiusSyncSettings";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/iradius",
)({
	beforeLoad: ({ context, params }) => {
		if (context.session?.user?.role !== "admin") {
			throw redirect({
				to: "/app/$organizationSlug/settings/general",
				params: { organizationSlug: params.organizationSlug },
			});
		}
	},
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

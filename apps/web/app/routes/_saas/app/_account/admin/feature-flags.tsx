import { config } from "@repo/config";
import { CreateFeatureFlagForm, FeatureFlagsList } from "@saas/admin/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/admin/feature-flags")(
	{
		head: () => ({
			meta: [{ title: `Feature Flags - Admin - ${config.appName}` }],
		}),
		component: FeatureFlagsPage,
	},
);

function FeatureFlagsPage() {
	return (
		<SettingsList>
			<CreateFeatureFlagForm />
			<FeatureFlagsList />
		</SettingsList>
	);
}

import { config } from "@repo/config";
import { MarketingSettingsForm } from "@saas/marketing/client";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/marketing",
)({
	head: () => ({
		meta: [{ title: `Marketing - ${config.appName}` }],
	}),
	component: MarketingSettingsPage,
});

function MarketingSettingsPage() {
	return (
		<SettingsList>
			<MarketingSettingsForm />
		</SettingsList>
	);
}

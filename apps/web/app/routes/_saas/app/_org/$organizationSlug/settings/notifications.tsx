import { config } from "@repo/config";
import { NotificationSettings } from "@saas/settings/client";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/notifications",
)({
	head: () => ({
		meta: [{ title: `Notifications - ${config.appName}` }],
	}),
	component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
	return (
		<SettingsList>
			<NotificationSettings />
		</SettingsList>
	);
}

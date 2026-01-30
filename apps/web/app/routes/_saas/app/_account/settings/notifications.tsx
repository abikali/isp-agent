import { config } from "@repo/config";
import { NotificationPreferencesForm } from "@saas/settings/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_account/settings/notifications",
)({
	head: () => ({
		meta: [{ title: `Notification Settings - ${config.appName}` }],
	}),
	component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
	return (
		<SettingsList>
			<NotificationPreferencesForm />
		</SettingsList>
	);
}

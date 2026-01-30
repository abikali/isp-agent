import { config } from "@repo/config";
import { DeleteAccountForm } from "@saas/settings/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_account/settings/danger-zone",
)({
	head: () => ({
		meta: [{ title: `Danger Zone - ${config.appName}` }],
	}),
	component: DangerZoneSettingsPage,
});

function DangerZoneSettingsPage() {
	return (
		<SettingsList>
			<DeleteAccountForm />
		</SettingsList>
	);
}

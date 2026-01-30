import { config } from "@repo/config";
import { ExportDataForm, RequestDeletionForm } from "@saas/settings/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/settings/privacy")({
	head: () => ({
		meta: [{ title: `Privacy Settings - ${config.appName}` }],
	}),
	component: PrivacySettingsPage,
});

function PrivacySettingsPage() {
	return (
		<SettingsList>
			<ExportDataForm />
			<RequestDeletionForm />
		</SettingsList>
	);
}

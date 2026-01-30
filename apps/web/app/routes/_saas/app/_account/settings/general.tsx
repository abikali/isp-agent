import { config } from "@repo/config";
import {
	ChangeEmailForm,
	ChangeNameForm,
	UserAvatarForm,
} from "@saas/settings/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/settings/general")({
	head: () => ({
		meta: [{ title: `General Settings - ${config.appName}` }],
	}),
	component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
	return (
		<SettingsList>
			<UserAvatarForm />
			<ChangeNameForm />
			<ChangeEmailForm />
		</SettingsList>
	);
}

import { config } from "@repo/config";
import {
	ActiveSessionsBlock,
	ChangePasswordForm,
	PasskeysBlock,
	SetPasswordForm,
	TwoFactorBlock,
} from "@saas/settings/client";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getUserAccountsFn } from "~/server/auth";

const getSecurityDataFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const userAccounts = await getUserAccountsFn();

		const userHasPassword = userAccounts?.some(
			(account) => account.providerId === "credential",
		);

		return { userHasPassword };
	},
);

export const Route = createFileRoute("/_saas/app/_account/settings/security")({
	loader: () => getSecurityDataFn(),
	head: () => ({
		meta: [{ title: `Security Settings - ${config.appName}` }],
	}),
	component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
	const { userHasPassword } = Route.useLoaderData();

	return (
		<SettingsList>
			{config.auth.enablePasswordLogin &&
				(userHasPassword ? (
					<ChangePasswordForm />
				) : (
					<SetPasswordForm />
				))}
			{config.auth.enablePasskeys && <PasskeysBlock />}
			{config.auth.enableTwoFactor && <TwoFactorBlock />}
			<ActiveSessionsBlock />
		</SettingsList>
	);
}

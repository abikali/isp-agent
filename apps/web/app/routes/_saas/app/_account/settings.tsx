import { config } from "@repo/config";
import { SettingsMenu } from "@saas/settings/client";
import {
	AppNotFound,
	PageHeader,
	SidebarContentLayout,
} from "@saas/shared/client";
import { UserAvatar } from "@shared/components/UserAvatar";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
	BellIcon,
	CreditCardIcon,
	LockKeyholeIcon,
	SettingsIcon,
	ShieldIcon,
	TriangleAlertIcon,
} from "lucide-react";

export const Route = createFileRoute("/_saas/app/_account/settings")({
	component: SettingsLayout,
	notFoundComponent: SettingsNotFound,
});

function SettingsNotFound() {
	return <AppNotFound />;
}

function SettingsLayout() {
	const { session } = Route.useRouteContext();

	const menuItems = [
		{
			title: "Account",
			avatar: (
				<UserAvatar
					name={session.user.name ?? ""}
					avatarUrl={session.user.image}
				/>
			),
			items: [
				{
					title: "General",
					href: "/app/settings/general",
					icon: <SettingsIcon className="size-4 opacity-50" />,
				},
				{
					title: "Security",
					href: "/app/settings/security",
					icon: <LockKeyholeIcon className="size-4 opacity-50" />,
				},
				{
					title: "Notifications",
					href: "/app/settings/notifications",
					icon: <BellIcon className="size-4 opacity-50" />,
				},
				{
					title: "Privacy",
					href: "/app/settings/privacy",
					icon: <ShieldIcon className="size-4 opacity-50" />,
				},
				...(config.users.enableBilling
					? [
							{
								title: "Billing",
								href: "/app/settings/billing",
								icon: (
									<CreditCardIcon className="size-4 opacity-50" />
								),
							},
						]
					: []),
				{
					title: "Danger Zone",
					href: "/app/settings/danger-zone",
					icon: <TriangleAlertIcon className="size-4 opacity-50" />,
				},
			],
		},
	];

	return (
		<>
			<PageHeader
				title="Account Settings"
				subtitle="Manage your account settings and preferences."
			/>
			<SidebarContentLayout
				sidebar={<SettingsMenu menuItems={menuItems} />}
			>
				<Outlet />
			</SidebarContentLayout>
		</>
	);
}

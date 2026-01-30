import { config } from "@repo/config";
import { SettingsMenu } from "@saas/settings/client";
import {
	AppNotFound,
	PageHeader,
	SidebarContentLayout,
} from "@saas/shared/client";
import { Logo } from "@shared/components/Logo";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Building2Icon, FlagIcon, UsersIcon } from "lucide-react";

export const Route = createFileRoute("/_saas/app/_account/admin")({
	beforeLoad: ({ context }) => {
		if (context.session.user.role !== "admin") {
			throw redirect({ to: "/app" });
		}
	},
	component: AdminLayout,
	notFoundComponent: AdminNotFound,
});

function AdminNotFound() {
	return <AppNotFound />;
}

function AdminLayout() {
	const menuItems = [
		{
			avatar: <Logo className="size-8" withLabel={false} />,
			title: "Admin",
			items: [
				{
					title: "Users",
					href: "/app/admin/users",
					icon: <UsersIcon className="size-4 opacity-50" />,
				},
				...(config.organizations.enable
					? [
							{
								title: "Organizations",
								href: "/app/admin/organizations",
								icon: (
									<Building2Icon className="size-4 opacity-50" />
								),
							},
						]
					: []),
				{
					title: "Feature Flags",
					href: "/app/admin/feature-flags",
					icon: <FlagIcon className="size-4 opacity-50" />,
				},
			],
		},
	];

	return (
		<>
			<PageHeader title="Admin" subtitle="Manage your application" />
			<SidebarContentLayout
				sidebar={<SettingsMenu menuItems={menuItems} />}
			>
				<Outlet />
			</SidebarContentLayout>
		</>
	);
}

import { isOrganizationAdmin } from "@repo/auth/lib/helper";
import { config } from "@repo/config";
import { OrganizationLogo } from "@saas/organizations/client";
import { SettingsMenu } from "@saas/settings/client";
import {
	AppNotFound,
	PageHeader,
	SidebarContentLayout,
} from "@saas/shared/client";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
	ClipboardListIcon,
	CreditCardIcon,
	KeyIcon,
	PlugIcon,
	Settings2Icon,
	ShieldCheckIcon,
	SparklesIcon,
	TriangleAlertIcon,
	Users2Icon,
	WebhookIcon,
} from "lucide-react";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings",
)({
	// Organization is available from parent's beforeLoad context
	// Session is available from _saas parent's beforeLoad context
	loader: ({ context }) => {
		const { organization, session } = context;

		const userIsOrganizationAdmin = isOrganizationAdmin(
			organization,
			session?.user,
		);

		return {
			organization: {
				name: organization.name,
				logo: organization.logo,
				slug: organization.slug,
			},
			userIsOrganizationAdmin,
		};
	},
	component: OrganizationSettingsLayout,
	notFoundComponent: OrgSettingsNotFound,
});

function OrgSettingsNotFound() {
	return <AppNotFound />;
}

function OrganizationSettingsLayout() {
	const { organization, userIsOrganizationAdmin } = Route.useLoaderData();
	const { organizationSlug } = Route.useParams();

	const organizationSettingsBasePath = `/app/${organizationSlug}/settings`;

	const menuItems = [
		{
			title: "Organization",
			avatar: (
				<OrganizationLogo
					name={organization.name}
					logoUrl={organization.logo}
				/>
			),
			items: [
				{
					title: "General",
					href: `${organizationSettingsBasePath}/general`,
					icon: <Settings2Icon className="size-4 opacity-50" />,
				},
				{
					title: "Members",
					href: `${organizationSettingsBasePath}/members`,
					icon: <Users2Icon className="size-4 opacity-50" />,
				},
				...(userIsOrganizationAdmin
					? [
							{
								title: "Roles",
								href: `${organizationSettingsBasePath}/roles`,
								icon: (
									<ShieldCheckIcon className="size-4 opacity-50" />
								),
							},
							{
								title: "API Keys",
								href: `${organizationSettingsBasePath}/api-keys`,
								icon: <KeyIcon className="size-4 opacity-50" />,
							},
							{
								title: "Webhooks",
								href: `${organizationSettingsBasePath}/webhooks`,
								icon: (
									<WebhookIcon className="size-4 opacity-50" />
								),
							},
							{
								title: "Integrations",
								href: `${organizationSettingsBasePath}/integrations`,
								icon: (
									<PlugIcon className="size-4 opacity-50" />
								),
							},
							{
								title: "Audit Logs",
								href: `${organizationSettingsBasePath}/audit`,
								icon: (
									<ClipboardListIcon className="size-4 opacity-50" />
								),
							},
							{
								title: "AI & Credits",
								href: `${organizationSettingsBasePath}/ai`,
								icon: (
									<SparklesIcon className="size-4 opacity-50" />
								),
							},
						]
					: []),
				...(config.organizations.enable &&
				config.organizations.enableBilling &&
				userIsOrganizationAdmin
					? [
							{
								title: "Billing",
								href: `${organizationSettingsBasePath}/billing`,
								icon: (
									<CreditCardIcon className="size-4 opacity-50" />
								),
							},
						]
					: []),
				...(userIsOrganizationAdmin
					? [
							{
								title: "Danger Zone",
								href: `${organizationSettingsBasePath}/danger-zone`,
								icon: (
									<TriangleAlertIcon className="size-4 opacity-50" />
								),
							},
						]
					: []),
			],
		},
	];

	return (
		<>
			<PageHeader
				title="Organization Settings"
				subtitle="Manage your organization settings and preferences"
			/>
			<SidebarContentLayout
				sidebar={<SettingsMenu menuItems={menuItems} />}
			>
				<Outlet />
			</SidebarContentLayout>
		</>
	);
}

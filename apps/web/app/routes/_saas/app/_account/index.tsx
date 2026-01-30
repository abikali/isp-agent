import { config } from "@repo/config";
import { PageHeader } from "@saas/shared/client";
import { UserStart } from "@saas/start/client";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/")({
	beforeLoad: ({ context }) => {
		const { session, organizations } = context;

		// If organization is required, redirect to organization dashboard
		if (
			config.organizations.enable &&
			config.organizations.requireOrganization
		) {
			const organization =
				organizations?.find(
					(org) => org.id === session.session.activeOrganizationId,
				) || organizations?.[0];

			if (!organization) {
				throw redirect({ to: "/new-organization" });
			}

			throw redirect({ to: `/app/${organization.slug}` as "/" });
		}
	},
	head: () => ({
		meta: [{ title: `Dashboard - ${config.appName}` }],
	}),
	component: AppStartPage,
});

function AppStartPage() {
	const { session } = Route.useRouteContext();

	return (
		<div>
			<PageHeader
				title={`Welcome, ${session?.user.name}`}
				subtitle="Here's what's happening with your account."
			/>

			<UserStart />
		</div>
	);
}

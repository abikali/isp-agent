import { config } from "@repo/config";
import { SessionProvider } from "@saas/auth/client";
import { ActiveOrganizationProvider } from "@saas/organizations/client";
import { ConfirmationAlertProvider } from "@saas/shared/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getOrganizationListFn, getSessionFn } from "~/server/auth";

export const Route = createFileRoute("/_saas")({
	beforeLoad: async () => {
		// Fetch session and org list in parallel to reduce waterfall
		const [session, organizations] = await Promise.all([
			getSessionFn(),
			config.organizations.enable
				? getOrganizationListFn()
				: Promise.resolve([]),
		]);

		if (!session?.user) {
			throw redirect({ to: "/login" });
		}

		return { session, organizations };
	},
	component: SaaSLayout,
});

function SaaSLayout() {
	const { session } = Route.useRouteContext();

	return (
		<SessionProvider initialSession={session}>
			<ActiveOrganizationProvider>
				<ConfirmationAlertProvider>
					<Outlet />
				</ConfirmationAlertProvider>
			</ActiveOrganizationProvider>
		</SessionProvider>
	);
}

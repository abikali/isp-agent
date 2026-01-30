import { SessionProvider } from "@saas/auth/client";
import { AuthWrapper } from "@saas/shared/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessionFn } from "~/server/auth";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async () => {
		const session = await getSessionFn();

		// Redirect authenticated users away from auth pages
		if (session?.user) {
			throw redirect({ to: "/app" });
		}

		return { session };
	},
	component: AuthLayout,
});

function AuthLayout() {
	const { session } = Route.useRouteContext();

	return (
		<SessionProvider initialSession={session}>
			<AuthWrapper>
				<Outlet />
			</AuthWrapper>
		</SessionProvider>
	);
}

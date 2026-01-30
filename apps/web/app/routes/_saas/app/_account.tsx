import { AppNotFound, AppWrapper } from "@saas/shared/client";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account")({
	beforeLoad: ({ context }) => {
		// Pass through context from parent route to child routes
		return context;
	},
	component: AccountLayout,
	notFoundComponent: AccountNotFound,
});

function AccountNotFound() {
	return (
		<AppWrapper>
			<AppNotFound />
		</AppWrapper>
	);
}

function AccountLayout() {
	return (
		<AppWrapper>
			<Outlet />
		</AppWrapper>
	);
}

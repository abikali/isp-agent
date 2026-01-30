import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/settings/")({
	beforeLoad: () => {
		throw redirect({ to: "/app/settings/general" });
	},
	component: () => null,
});

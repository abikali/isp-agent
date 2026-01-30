import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/admin/")({
	beforeLoad: () => {
		throw redirect({ to: "/app/admin/users" });
	},
	component: () => null,
});

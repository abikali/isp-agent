import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/reports",
)({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/$organizationSlug/billing",
			params: { organizationSlug: params.organizationSlug },
		});
	},
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/",
)({
	beforeLoad: ({ params }: { params: { organizationSlug: string } }) => {
		throw redirect({
			to: "/app/$organizationSlug/settings/general",
			params: { organizationSlug: params.organizationSlug },
		});
	},
	component: () => null,
});

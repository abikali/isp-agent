import { config } from "@repo/config";
import { DashboardContent, DashboardSkeleton } from "@saas/dashboard/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_org/$organizationSlug/")({
	loader: async ({ context }) => {
		const { organization } = context;
		return {
			organizationId: organization.id,
		};
	},
	head: () => ({
		meta: [{ title: `Dashboard - ${config.appName}` }],
	}),
	component: DashboardPage,
});

function DashboardPage() {
	const { organizationSlug } = Route.useParams();
	const loaderData = Route.useLoaderData();

	return (
		<AsyncBoundary fallback={<DashboardSkeleton />}>
			<DashboardContent
				organizationSlug={organizationSlug}
				organizationId={loaderData.organizationId}
			/>
		</AsyncBoundary>
	);
}

import { config } from "@repo/config";
import { PlansList, PlansListSkeleton } from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/plans",
)({
	head: () => ({
		meta: [{ title: `Service Plans - ${config.appName}` }],
	}),
	component: PlansPage,
});

function PlansPage() {
	return (
		<AsyncBoundary fallback={<PlansListSkeleton />}>
			<PlansList />
		</AsyncBoundary>
	);
}

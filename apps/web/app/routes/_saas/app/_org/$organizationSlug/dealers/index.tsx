import { config } from "@repo/config";
import { DealersList, DealersListSkeleton } from "@saas/dealers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/dealers/",
)({
	head: () => ({
		meta: [{ title: `Dealers - ${config.appName}` }],
	}),
	component: DealersPage,
});

function DealersPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<AsyncBoundary fallback={<DealersListSkeleton />}>
			<DealersList organizationSlug={organizationSlug} />
		</AsyncBoundary>
	);
}

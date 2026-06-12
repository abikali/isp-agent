import { config } from "@repo/config";
import { StockList, StockListSkeleton } from "@saas/stock/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/stock/",
)({
	head: () => ({
		meta: [{ title: `Stock - ${config.appName}` }],
	}),
	component: StockPage,
});

function StockPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="inventory" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<StockListSkeleton />
					</PageShellSkeleton>
				}
			>
				<StockList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

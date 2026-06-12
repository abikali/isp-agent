import { config } from "@repo/config";
import { StockListSkeleton, StockLogList } from "@saas/stock/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/stock/log",
)({
	head: () => ({
		meta: [{ title: `Stock Log - ${config.appName}` }],
	}),
	component: StockLogPage,
});

function StockLogPage() {
	return (
		<PermissionGate resource="inventory" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<StockListSkeleton />
					</PageShellSkeleton>
				}
			>
				<StockLogList />
			</AsyncBoundary>
		</PermissionGate>
	);
}

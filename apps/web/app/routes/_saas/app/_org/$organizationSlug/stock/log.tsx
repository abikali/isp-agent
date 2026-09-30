import { config } from "@repo/config";
import { StockListSkeleton, StockLogList } from "@saas/stock/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** `?supplierId=` opens the log on one supplier's deliveries (Suppliers page). */
const stockLogSearchSchema = z.object({
	supplierId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/stock/log",
)({
	validateSearch: stockLogSearchSchema,
	head: () => ({
		meta: [{ title: `Stock Log - ${config.appName}` }],
	}),
	component: StockLogPage,
});

function StockLogPage() {
	const { supplierId } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<PermissionGate resource="inventory" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<StockListSkeleton />
					</PageShellSkeleton>
				}
			>
				<StockLogList
					supplierId={supplierId}
					onSupplierChange={(next) =>
						navigate({
							search: { supplierId: next },
							replace: true,
						})
					}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

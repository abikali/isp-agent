import { config } from "@repo/config";
import { StockListSkeleton, SuppliersList } from "@saas/stock/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/stock/suppliers",
)({
	head: () => ({
		meta: [{ title: `Suppliers - ${config.appName}` }],
	}),
	component: SuppliersPage,
});

// Suppliers are admin-facing: field workers hold inventory:read (their own
// stock) but not inventory:update.
function SuppliersPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="inventory" action="update">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<StockListSkeleton />
					</PageShellSkeleton>
				}
			>
				<SuppliersList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

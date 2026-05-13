import { config } from "@repo/config";
import { CustomerDetail } from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/$customerId",
)({
	head: () => ({
		meta: [{ title: `Customer Details - ${config.appName}` }],
	}),
	component: CustomerDetailPage,
});

function CustomerDetailPage() {
	const { customerId, organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="customers" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<Skeleton className="h-96" />
					</PageShellSkeleton>
				}
			>
				<CustomerDetail
					customerId={customerId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

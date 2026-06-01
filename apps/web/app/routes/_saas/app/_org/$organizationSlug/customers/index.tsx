import { config } from "@repo/config";
import { CustomersList, CustomersListSkeleton } from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/",
)({
	head: () => ({
		meta: [{ title: `Customers - ${config.appName}` }],
	}),
	component: CustomersPage,
});

function CustomersPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="customers" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<CustomersListSkeleton />
					</PageShellSkeleton>
				}
			>
				<CustomersList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

import { config } from "@repo/config";
import {
	CustomersListSkeleton,
	PendingCustomersList,
} from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/approvals",
)({
	head: () => ({
		meta: [{ title: `New Customers - ${config.appName}` }],
	}),
	component: ApprovalsPage,
});

function ApprovalsPage() {
	return (
		<PermissionGate resource="customers" action="update">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<CustomersListSkeleton />
					</PageShellSkeleton>
				}
			>
				<PendingCustomersList />
			</AsyncBoundary>
		</PermissionGate>
	);
}

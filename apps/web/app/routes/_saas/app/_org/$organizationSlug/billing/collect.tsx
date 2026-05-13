import { config } from "@repo/config";
import {
	BillingWorkbench,
	UnpaidCustomersList,
	UnpaidCustomersListSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collect",
)({
	head: () => ({
		meta: [{ title: `Collect Payments - ${config.appName}` }],
	}),
	component: CollectPage,
});

function CollectPage() {
	return (
		<PermissionGate resource="billing" action="collect">
			<BillingWorkbench
				title="Unpaid"
				description="Customers due this billing cycle"
			>
				<AsyncBoundary fallback={<UnpaidCustomersListSkeleton />}>
					<UnpaidCustomersList />
				</AsyncBoundary>
			</BillingWorkbench>
		</PermissionGate>
	);
}

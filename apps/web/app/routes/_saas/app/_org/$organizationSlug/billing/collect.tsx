import { config } from "@repo/config";
import {
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
			<AsyncBoundary fallback={<UnpaidCustomersListSkeleton />}>
				<UnpaidCustomersList />
			</AsyncBoundary>
		</PermissionGate>
	);
}

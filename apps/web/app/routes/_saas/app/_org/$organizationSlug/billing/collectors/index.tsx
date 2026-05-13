import { config } from "@repo/config";
import {
	BillingWorkbench,
	CollectorsHub,
	CollectorsHubSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collectors/",
)({
	head: () => ({
		meta: [{ title: `Collectors - ${config.appName}` }],
	}),
	component: CollectorsPage,
});

function CollectorsPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<BillingWorkbench
				title="Collectors"
				description="Cash position, collection progress, and per-collector drill-down"
			>
				<AsyncBoundary fallback={<CollectorsHubSkeleton />}>
					<CollectorsHub />
				</AsyncBoundary>
			</BillingWorkbench>
		</PermissionGate>
	);
}

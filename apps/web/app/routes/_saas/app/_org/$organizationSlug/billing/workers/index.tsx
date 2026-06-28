import { config } from "@repo/config";
import {
	BillingWorkbench,
	WorkersHub,
	WorkersHubSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/workers/",
)({
	head: () => ({
		meta: [{ title: `Worker Cash - ${config.appName}` }],
	}),
	component: WorkersPage,
});

function WorkersPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<BillingWorkbench
				title="Worker Cash"
				description="Collect cash handoffs from workers and pay their salaries"
			>
				<AsyncBoundary fallback={<WorkersHubSkeleton />}>
					<WorkersHub />
				</AsyncBoundary>
			</BillingWorkbench>
		</PermissionGate>
	);
}

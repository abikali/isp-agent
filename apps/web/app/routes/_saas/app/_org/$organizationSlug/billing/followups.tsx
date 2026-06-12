import { config } from "@repo/config";
import { BillingWorkbench, FollowupsList } from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/followups",
)({
	head: () => ({
		meta: [{ title: `Follow-ups - ${config.appName}` }],
	}),
	component: FollowupsPage,
});

function FollowupsPage() {
	return (
		<PermissionGate resource="followups" action="read">
			<BillingWorkbench
				title="Follow-ups"
				description="Customers who need a call back"
			>
				<AsyncBoundary
					fallback={<Skeleton className="h-96 rounded-lg" />}
				>
					<FollowupsList />
				</AsyncBoundary>
			</BillingWorkbench>
		</PermissionGate>
	);
}

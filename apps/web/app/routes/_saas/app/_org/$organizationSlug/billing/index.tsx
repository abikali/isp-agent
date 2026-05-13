import { config } from "@repo/config";
import {
	BillingCycleManager,
	BillingDashboard,
	BillingDashboardSkeleton,
	RegenerateInvoicesCard,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/",
)({
	head: () => ({
		meta: [{ title: `Billing - ${config.appName}` }],
	}),
	component: BillingPage,
});

function BillingPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<PageShell
				title="Billing"
				description="Monthly billing cycle, collected revenue, and invoice regeneration."
			>
				<BillingCycleManager />
				<AsyncBoundary fallback={<BillingDashboardSkeleton />}>
					<BillingDashboard />
				</AsyncBoundary>
				<RegenerateInvoicesCard />
			</PageShell>
		</PermissionGate>
	);
}

import { config } from "@repo/config";
import {
	AccountingReports,
	AccountingReportsSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/reports",
)({
	head: () => ({
		meta: [{ title: `Accounting Reports - ${config.appName}` }],
	}),
	component: ReportsPage,
});

function ReportsPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<PageShell
				title="Reports"
				description="P&L, tax summaries, and aged receivables for accounting."
			>
				<AsyncBoundary fallback={<AccountingReportsSkeleton />}>
					<AccountingReports />
				</AsyncBoundary>
			</PageShell>
		</PermissionGate>
	);
}

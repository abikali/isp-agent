import { config } from "@repo/config";
import { EmployeeReport } from "@saas/employees/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/employees/$employeeId/report",
)({
	head: () => ({
		meta: [{ title: `Worker Report - ${config.appName}` }],
	}),
	component: EmployeeReportPage,
});

function EmployeeReportPage() {
	const { employeeId, organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="employees" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<Skeleton className="h-96" />
					</PageShellSkeleton>
				}
			>
				<EmployeeReport
					employeeId={employeeId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

import { config } from "@repo/config";
import { EmployeeDetail } from "@saas/employees/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/employees/$employeeId/",
)({
	head: () => ({
		meta: [{ title: `Employee Details - ${config.appName}` }],
	}),
	component: EmployeeDetailPage,
});

function EmployeeDetailPage() {
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
				<EmployeeDetail
					employeeId={employeeId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

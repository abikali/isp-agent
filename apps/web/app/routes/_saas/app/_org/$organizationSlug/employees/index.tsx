import { config } from "@repo/config";
import { EmployeesList, EmployeesListSkeleton } from "@saas/employees/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/employees/",
)({
	head: () => ({
		meta: [{ title: `Employees - ${config.appName}` }],
	}),
	component: EmployeesPage,
});

function EmployeesPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="employees" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<EmployeesListSkeleton />
					</PageShellSkeleton>
				}
			>
				<EmployeesList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

import { config } from "@repo/config";
import { EmployeeDetail } from "@saas/employees/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/employees/$employeeId",
)({
	head: () => ({
		meta: [{ title: `Employee Details - ${config.appName}` }],
	}),
	component: EmployeeDetailPage,
});

function EmployeeDetailPage() {
	const { employeeId } = Route.useParams();

	return (
		<AsyncBoundary fallback={<Skeleton className="h-96" />}>
			<EmployeeDetail employeeId={employeeId} />
		</AsyncBoundary>
	);
}

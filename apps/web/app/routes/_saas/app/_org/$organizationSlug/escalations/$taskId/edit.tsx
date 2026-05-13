import { config } from "@repo/config";
import { TaskDetail } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/escalations/$taskId/edit",
)({
	head: () => ({
		meta: [{ title: `Edit Escalation - ${config.appName}` }],
	}),
	component: EscalationEditPage,
});

function EscalationEditPage() {
	const { taskId } = Route.useParams();

	return (
		<PermissionGate resource="tasks" action="update">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<Skeleton className="h-96" />
					</PageShellSkeleton>
				}
			>
				<TaskDetail
					taskId={taskId}
					backPath="/app/$organizationSlug/escalations/$taskId"
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

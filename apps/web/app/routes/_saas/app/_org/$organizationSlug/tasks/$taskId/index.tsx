import { config } from "@repo/config";
import { TaskView } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/tasks/$taskId/",
)({
	head: () => ({
		meta: [{ title: `Task Details - ${config.appName}` }],
	}),
	component: TaskViewPage,
});

function TaskViewPage() {
	const { taskId } = Route.useParams();

	return (
		<PermissionGate resource="tasks" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<Skeleton className="h-96" />
					</PageShellSkeleton>
				}
			>
				<TaskView taskId={taskId} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

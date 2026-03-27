import { config } from "@repo/config";
import { TaskView } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
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
			<AsyncBoundary fallback={<Skeleton className="h-96" />}>
				<TaskView taskId={taskId} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

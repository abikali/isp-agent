import { config } from "@repo/config";
import { TaskDetail } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/tasks/$taskId/edit",
)({
	head: () => ({
		meta: [{ title: `Edit Task - ${config.appName}` }],
	}),
	component: TaskEditPage,
});

function TaskEditPage() {
	const { taskId } = Route.useParams();

	return (
		<PermissionGate resource="tasks" action="update">
			<AsyncBoundary fallback={<Skeleton className="h-96" />}>
				<TaskDetail taskId={taskId} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

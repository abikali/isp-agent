import { config } from "@repo/config";
import { TaskDetail } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/tasks/$taskId",
)({
	head: () => ({
		meta: [{ title: `Task Details - ${config.appName}` }],
	}),
	component: TaskDetailPage,
});

function TaskDetailPage() {
	const { taskId } = Route.useParams();

	return (
		<AsyncBoundary fallback={<Skeleton className="h-96" />}>
			<TaskDetail taskId={taskId} />
		</AsyncBoundary>
	);
}

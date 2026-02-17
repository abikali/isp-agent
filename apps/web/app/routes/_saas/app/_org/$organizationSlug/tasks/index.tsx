import { config } from "@repo/config";
import { TasksList, TasksListSkeleton } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/tasks/",
)({
	head: () => ({
		meta: [{ title: `Tasks - ${config.appName}` }],
	}),
	component: TasksPage,
});

function TasksPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<AsyncBoundary fallback={<TasksListSkeleton />}>
			<TasksList organizationSlug={organizationSlug} />
		</AsyncBoundary>
	);
}

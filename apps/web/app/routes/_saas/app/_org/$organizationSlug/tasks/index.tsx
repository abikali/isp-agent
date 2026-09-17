import { config } from "@repo/config";
import { TasksList, TasksListSkeleton } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * `?status=` opens the list on one status — the sidebar badge links to
 * `PENDING_APPROVAL` so an approver lands on the completions waiting for them.
 */
const tasksSearchSchema = z.object({
	status: z
		.enum(["OPEN", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"])
		.optional()
		.catch(undefined),
});

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/tasks/",
)({
	validateSearch: tasksSearchSchema,
	head: () => ({
		meta: [{ title: `Tasks - ${config.appName}` }],
	}),
	component: TasksPage,
});

function TasksPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="tasks" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<TasksListSkeleton />
					</PageShellSkeleton>
				}
			>
				<TasksList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

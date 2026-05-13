import { config } from "@repo/config";
import { EscalationsList, TasksListSkeleton } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/escalations/",
)({
	head: () => ({
		meta: [{ title: `AI Escalations - ${config.appName}` }],
	}),
	component: EscalationsPage,
});

function EscalationsPage() {
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
				<EscalationsList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

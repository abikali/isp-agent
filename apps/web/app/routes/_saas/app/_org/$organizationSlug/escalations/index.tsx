import { config } from "@repo/config";
import { EscalationsList, TasksListSkeleton } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
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
			<AsyncBoundary fallback={<TasksListSkeleton />}>
				<EscalationsList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

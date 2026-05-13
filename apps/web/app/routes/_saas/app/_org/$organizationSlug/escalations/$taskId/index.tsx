import { config } from "@repo/config";
import { EscalationView } from "@saas/tasks/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/escalations/$taskId/",
)({
	head: () => ({
		meta: [{ title: `Escalation Details - ${config.appName}` }],
	}),
	component: EscalationViewPage,
});

function EscalationViewPage() {
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
				<EscalationView taskId={taskId} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

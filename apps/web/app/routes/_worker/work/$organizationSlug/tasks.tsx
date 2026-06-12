import { useActiveOrganization } from "@saas/organizations/client";
import { WorkerTasks } from "@saas/worker/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute("/_worker/work/$organizationSlug/tasks")({
	component: PageComponent,
});

function PageComponent() {
	const { activeOrganization } = useActiveOrganization();

	// Wait for client-side org context before rendering data-fetching components
	if (!activeOrganization) {
		return <Skeleton className="h-64 rounded-lg" />;
	}

	return (
		<AsyncBoundary fallback={<Skeleton className="h-64 rounded-lg" />}>
			<WorkerTasks />
		</AsyncBoundary>
	);
}

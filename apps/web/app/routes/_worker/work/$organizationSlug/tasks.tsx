import { useActiveOrganization } from "@saas/organizations/client";
import { WorkerTasks } from "@saas/worker/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute("/_worker/work/$organizationSlug/tasks")({
	// `?task=<id>` — deep link from a worker's Telegram / in-app notification.
	validateSearch: (search: Record<string, unknown>): { task?: string } => ({
		task: typeof search["task"] === "string" ? search["task"] : undefined,
	}),
	component: PageComponent,
});

function PageComponent() {
	const { activeOrganization } = useActiveOrganization();
	const { task } = Route.useSearch();
	const navigate = Route.useNavigate();

	// Wait for client-side org context before rendering data-fetching components
	if (!activeOrganization) {
		return <Skeleton className="h-64 rounded-lg" />;
	}

	return (
		<AsyncBoundary fallback={<Skeleton className="h-64 rounded-lg" />}>
			<WorkerTasks
				focusTaskId={task}
				onClearFocus={() => navigate({ search: {} })}
			/>
		</AsyncBoundary>
	);
}

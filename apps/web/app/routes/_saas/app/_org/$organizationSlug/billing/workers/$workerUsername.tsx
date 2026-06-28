import { config } from "@repo/config";
import {
	WorkerCashWorkspace,
	WorkerCashWorkspaceSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/workers/$workerUsername",
)({
	head: () => ({
		meta: [{ title: `Worker Cash - ${config.appName}` }],
	}),
	component: WorkerDetailPage,
});

function WorkerDetailPage() {
	const { workerUsername, organizationSlug } = Route.useParams();
	const backTo = `/app/${organizationSlug}/billing/workers`;

	return (
		<PermissionGate resource="billing" action="manage">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<WorkerCashWorkspaceSkeleton />
					</PageShellSkeleton>
				}
			>
				<WorkerDetailContent
					username={workerUsername}
					backTo={backTo}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

function WorkerDetailContent({
	username,
	backTo,
}: {
	username: string;
	backTo: string;
}) {
	const organizationId = useOrganizationId();

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.billing.workers.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "workers", "list"]),
	);

	if (isLoading) {
		return <WorkerCashWorkspaceSkeleton />;
	}

	const worker = (data?.workers ?? []).find(
		(w) => w.username === username || w.id === username,
	);

	if (!worker) {
		return (
			<div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
				<p className="text-base font-medium">Worker not found</p>
				<p className="mt-1 text-sm text-muted-foreground">
					No worker with “{username}” exists in this organization.
				</p>
				<a
					href={backTo}
					className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
				>
					← Back to workers
				</a>
			</div>
		);
	}

	return (
		<WorkerCashWorkspace
			workerId={worker.id}
			workerName={worker.name}
			workerUsername={worker.username}
			workerPhone={worker.phone}
			customerCount={worker.customerCount}
			backTo={backTo}
		/>
	);
}

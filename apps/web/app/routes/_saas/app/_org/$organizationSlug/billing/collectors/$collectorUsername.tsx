import { config } from "@repo/config";
import {
	CollectorWorkspace,
	CollectorWorkspaceSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collectors/$collectorUsername",
)({
	head: () => ({
		meta: [{ title: `Collector - ${config.appName}` }],
	}),
	component: CollectorDetailPage,
});

function CollectorDetailPage() {
	const { collectorUsername, organizationSlug } = Route.useParams();
	const backTo = `/app/${organizationSlug}/billing/collectors`;

	return (
		<PermissionGate resource="billing" action="manage">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<CollectorWorkspaceSkeleton />
					</PageShellSkeleton>
				}
			>
				<CollectorDetailContent
					username={collectorUsername}
					backTo={backTo}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

function CollectorDetailContent({
	username,
	backTo,
}: {
	username: string;
	backTo: string;
}) {
	const organizationId = useOrganizationId();

	const { data: collectorsData, isLoading } = useQuery(
		organizationId
			? orpc.billing.collectors.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "collectors", "list"]),
	);

	if (isLoading) {
		return <CollectorWorkspaceSkeleton />;
	}

	const collector = (collectorsData?.collectors ?? []).find(
		(c) => c.username === username || c.id === username,
	);

	if (!collector) {
		return (
			<div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
				<p className="text-base font-medium">Collector not found</p>
				<p className="mt-1 text-sm text-muted-foreground">
					No collector with “{username}” exists in this organization.
				</p>
				<a
					href={backTo}
					className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
				>
					← Back to collectors
				</a>
			</div>
		);
	}

	return (
		<CollectorWorkspace
			collectorId={collector.id}
			collectorName={collector.name}
			collectorUsername={collector.username}
			collectorPhone={collector.phone}
			customerCount={collector.customerCount}
			pendingStoppedCount={collector.pendingStoppedCount}
			backTo={backTo}
		/>
	);
}

import { config } from "@repo/config";
import {
	CashCollectionPage,
	CashCollectionPageSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collections/$collectorUsername",
)({
	head: () => ({
		meta: [{ title: `Collector - ${config.appName}` }],
	}),
	component: CollectorDetailPage,
});

function CollectorDetailPage() {
	const { collectorUsername } = Route.useParams();

	return (
		<PermissionGate resource="billing" action="manage">
			<AsyncBoundary fallback={<CashCollectionPageSkeleton />}>
				<CollectorDetailContent username={collectorUsername} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

function CollectorDetailContent({ username }: { username: string }) {
	const organizationId = useOrganizationId();

	const { data: collectorsData } = useQuery(
		organizationId
			? orpc.billing.collectors.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "collectors", "list"]),
	);

	const collectors = collectorsData?.collectors ?? [];
	const collector = collectors.find(
		(c) => c.username === username || c.id === username,
	);

	if (!collector) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<p className="text-lg font-medium">Collector not found</p>
				<p className="text-sm text-muted-foreground">
					No collector with username &ldquo;{username}&rdquo; was
					found.
				</p>
			</div>
		);
	}

	return (
		<CashCollectionPage
			collectorId={collector.id}
			collectorName={collector.name}
		/>
	);
}

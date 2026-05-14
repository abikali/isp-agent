import { config } from "@repo/config";
import {
	BroadcastDetail,
	BroadcastDetailSkeleton,
} from "@saas/marketing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/marketing/$broadcastId/",
)({
	head: () => ({
		meta: [{ title: `Broadcast - ${config.appName}` }],
	}),
	component: BroadcastDetailPage,
});

function BroadcastDetailPage() {
	const { organizationSlug, broadcastId } = Route.useParams();
	return (
		<PermissionGate resource="marketing" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<BroadcastDetailSkeleton />
					</PageShellSkeleton>
				}
			>
				<BroadcastDetail
					broadcastId={broadcastId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

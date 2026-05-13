import { config } from "@repo/config";
import { WatcherDetail, WatcherDetailSkeleton } from "@saas/watchers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/watchers/$watcherId/",
)({
	head: () => ({
		meta: [{ title: `Watcher Detail - ${config.appName}` }],
	}),
	component: WatcherDetailPage,
});

function WatcherDetailPage() {
	const { organizationSlug, watcherId } = Route.useParams();

	return (
		<PermissionGate resource="watchers" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton showActions={false}>
						<WatcherDetailSkeleton />
					</PageShellSkeleton>
				}
			>
				<WatcherDetail
					watcherId={watcherId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

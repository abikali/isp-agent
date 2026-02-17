import { config } from "@repo/config";
import { WatcherDetail, WatcherDetailSkeleton } from "@saas/watchers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
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
		<AsyncBoundary fallback={<WatcherDetailSkeleton />}>
			<WatcherDetail
				watcherId={watcherId}
				organizationSlug={organizationSlug}
			/>
		</AsyncBoundary>
	);
}

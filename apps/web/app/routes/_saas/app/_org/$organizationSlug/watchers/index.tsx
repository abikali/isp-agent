import { config } from "@repo/config";
import { WatchersList, WatchersListSkeleton } from "@saas/watchers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/watchers/",
)({
	head: () => ({
		meta: [{ title: `Watchers - ${config.appName}` }],
	}),
	component: WatchersPage,
});

function WatchersPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<AsyncBoundary fallback={<WatchersListSkeleton />}>
			<WatchersList organizationSlug={organizationSlug} />
		</AsyncBoundary>
	);
}

import { config } from "@repo/config";
import { BroadcastsList, BroadcastsListSkeleton } from "@saas/marketing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/marketing/",
)({
	head: () => ({
		meta: [{ title: `Marketing - ${config.appName}` }],
	}),
	component: MarketingPage,
});

function MarketingPage() {
	const { organizationSlug } = Route.useParams();
	return (
		<PermissionGate resource="marketing" action="read">
			<AsyncBoundary fallback={<BroadcastsListSkeleton />}>
				<BroadcastsList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

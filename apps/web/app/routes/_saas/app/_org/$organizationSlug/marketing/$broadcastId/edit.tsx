import { config } from "@repo/config";
import { BroadcastEditLoader } from "@saas/marketing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/marketing/$broadcastId/edit",
)({
	head: () => ({
		meta: [{ title: `Edit Broadcast - ${config.appName}` }],
	}),
	component: EditBroadcastPage,
});

function EditBroadcastPage() {
	const { organizationSlug, broadcastId } = Route.useParams();
	return (
		<PermissionGate resource="marketing" action="send">
			<AsyncBoundary fallback={<PageShellSkeleton />}>
				<BroadcastEditLoader
					broadcastId={broadcastId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

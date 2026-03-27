import { config } from "@repo/config";
import { StationsList, StationsListSkeleton } from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/stations",
)({
	head: () => ({
		meta: [{ title: `Stations - ${config.appName}` }],
	}),
	component: StationsPage,
});

function StationsPage() {
	return (
		<PermissionGate resource="stations" action="read">
			<AsyncBoundary fallback={<StationsListSkeleton />}>
				<StationsList />
			</AsyncBoundary>
		</PermissionGate>
	);
}

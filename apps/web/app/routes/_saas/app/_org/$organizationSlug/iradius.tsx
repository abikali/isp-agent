import { config } from "@repo/config";
import { IRadiusControlCenter } from "@saas/iradius/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { TableSkeleton } from "@shared/components/TableSkeleton";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/iradius",
)({
	head: () => ({
		meta: [{ title: `iRadius Control Center - ${config.appName}` }],
	}),
	component: IRadiusRoute,
});

function IRadiusRoute() {
	return (
		<PageShell
			title="iRadius"
			description="Live link health, NAS telemetry, sync state, and bandwidth leaders"
		>
			<AsyncBoundary fallback={<TableSkeleton rows={6} columns={1} />}>
				<IRadiusControlCenter />
			</AsyncBoundary>
		</PageShell>
	);
}

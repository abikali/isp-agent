import { config } from "@repo/config";
import {
	InstallationsList,
	InstallationsListSkeleton,
} from "@saas/installations/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/installations/",
)({
	head: () => ({
		meta: [{ title: `Installations - ${config.appName}` }],
	}),
	component: InstallationsPage,
});

function InstallationsPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<PermissionGate resource="installations" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<InstallationsListSkeleton />
					</PageShellSkeleton>
				}
			>
				<InstallationsList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

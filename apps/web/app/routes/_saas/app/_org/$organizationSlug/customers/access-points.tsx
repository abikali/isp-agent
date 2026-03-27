import { config } from "@repo/config";
import {
	AccessPointsList,
	AccessPointsListSkeleton,
} from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/access-points",
)({
	head: () => ({
		meta: [{ title: `Access Points - ${config.appName}` }],
	}),
	component: AccessPointsPage,
});

function AccessPointsPage() {
	return (
		<PermissionGate resource="accessPoints" action="read">
			<AsyncBoundary fallback={<AccessPointsListSkeleton />}>
				<AccessPointsList />
			</AsyncBoundary>
		</PermissionGate>
	);
}

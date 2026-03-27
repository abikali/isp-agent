import { config } from "@repo/config";
import {
	StoppedAccountsList,
	StoppedAccountsListSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/stopped",
)({
	head: () => ({
		meta: [{ title: `Stopped Accounts - ${config.appName}` }],
	}),
	component: StoppedPage,
});

function StoppedPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<AsyncBoundary fallback={<StoppedAccountsListSkeleton />}>
				<StoppedAccountsList />
			</AsyncBoundary>
		</PermissionGate>
	);
}

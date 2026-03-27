import { config } from "@repo/config";
import {
	CashCollectionPage,
	CashCollectionPageSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collections",
)({
	head: () => ({
		meta: [{ title: `Cash Collections - ${config.appName}` }],
	}),
	component: CollectionsPage,
});

function CollectionsPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<AsyncBoundary fallback={<CashCollectionPageSkeleton />}>
				<CashCollectionPage />
			</AsyncBoundary>
		</PermissionGate>
	);
}

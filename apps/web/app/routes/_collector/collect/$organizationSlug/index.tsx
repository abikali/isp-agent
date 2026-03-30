import { CollectorPortal, CollectorPortalSkeleton } from "@saas/billing/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_collector/collect/$organizationSlug/")({
	component: CollectorPage,
});

function CollectorPage() {
	const { activeOrganization } = useActiveOrganization();

	// Wait for client-side org context before rendering data-fetching components
	if (!activeOrganization) {
		return <CollectorPortalSkeleton />;
	}

	return (
		<AsyncBoundary fallback={<CollectorPortalSkeleton />}>
			<CollectorPortal />
		</AsyncBoundary>
	);
}

import { config } from "@repo/config";
import { DealersList, DealersListSkeleton } from "@saas/dealers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_account/admin/dealers/")({
	head: () => ({
		meta: [{ title: `Dealers - Admin - ${config.appName}` }],
	}),
	component: AdminDealersPage,
});

function AdminDealersPage() {
	return (
		<AsyncBoundary fallback={<DealersListSkeleton />}>
			<DealersList />
		</AsyncBoundary>
	);
}

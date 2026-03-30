import { config } from "@repo/config";
import { DealerDetail } from "@saas/dealers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_account/admin/dealers/$dealerId",
)({
	head: () => ({
		meta: [{ title: `Dealer Details - Admin - ${config.appName}` }],
	}),
	component: AdminDealerDetailPage,
});

function AdminDealerDetailPage() {
	const { dealerId } = Route.useParams();

	return (
		<AsyncBoundary fallback={<Skeleton className="h-96" />}>
			<DealerDetail dealerId={dealerId} />
		</AsyncBoundary>
	);
}

import { config } from "@repo/config";
import { DealerDetail } from "@saas/dealers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/dealers/$dealerId",
)({
	head: () => ({
		meta: [{ title: `Dealer Details - ${config.appName}` }],
	}),
	component: DealerDetailPage,
});

function DealerDetailPage() {
	const { dealerId } = Route.useParams();

	return (
		<AsyncBoundary fallback={<Skeleton className="h-96" />}>
			<DealerDetail dealerId={dealerId} />
		</AsyncBoundary>
	);
}

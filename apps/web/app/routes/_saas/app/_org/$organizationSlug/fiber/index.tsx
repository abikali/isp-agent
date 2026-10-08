import { config } from "@repo/config";
import { FiberControlRoom } from "@saas/fiber/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";
import z from "zod";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/fiber/",
)({
	head: () => ({
		meta: [{ title: `Fiber - ${config.appName}` }],
	}),
	/** ?lead=<id> opens that lead (links from the customer page). */
	validateSearch: z.object({ lead: z.string().optional() }),
	component: FiberPage,
});

function FiberPage() {
	const { organizationSlug } = Route.useParams();
	const { lead } = Route.useSearch();
	return (
		<PermissionGate resource="marketing" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<Skeleton className="h-96 w-full" />
					</PageShellSkeleton>
				}
			>
				<FiberControlRoom
					organizationSlug={organizationSlug}
					initialLeadId={lead}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

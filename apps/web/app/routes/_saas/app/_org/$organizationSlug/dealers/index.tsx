import { config } from "@repo/config";
import {
	DealerFinancePage,
	DealerFinancePageSkeleton,
} from "@saas/dealers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getDealersFn = createServerFn({ method: "GET" })
	.inputValidator((data: { organizationSlug: string }) => data)
	.handler(async ({ data }) => {
		const { db } = await import("@repo/database");

		const organization = await db.organization.findUnique({
			where: { slug: data.organizationSlug },
			select: { id: true },
		});
		if (!organization) {
			return { dehydratedState: null };
		}

		const queryClient = getServerQueryClient();
		try {
			await queryClient.ensureQueryData(
				orpc.dealers.overview.queryOptions({
					input: { organizationId: organization.id },
				}),
			);
		} catch {
			// The client retries; AsyncBoundary shows the error if it persists.
			return { dehydratedState: null };
		}

		return {
			// react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone -- intentional SSR serialization of dehydrated query cache (strips non-serializable values for the client payload); canonical pattern per CLAUDE.md
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	});

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/dealers/",
)({
	loader: ({ params }) =>
		getDealersFn({ data: { organizationSlug: params.organizationSlug } }),
	head: () => ({
		meta: [{ title: `Dealers - ${config.appName}` }],
	}),
	component: DealersRoute,
});

function DealersRoute() {
	const loaderData = Route.useLoaderData();

	return (
		<PermissionGate resource="dealers" action="read">
			<AsyncBoundary
				fallback={<DealerFinancePageSkeleton />}
				dehydratedState={loaderData.dehydratedState}
			>
				<DealerFinancePage />
			</AsyncBoundary>
		</PermissionGate>
	);
}

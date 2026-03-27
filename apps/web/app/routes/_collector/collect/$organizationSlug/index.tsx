import { CollectorPortal, CollectorPortalSkeleton } from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getCollectorDataFn = createServerFn({ method: "GET" })
	.inputValidator((data: { organizationId: string }) => data)
	.handler(async ({ data }) => {
		const queryClient = getServerQueryClient();

		await Promise.all([
			queryClient.ensureQueryData(
				orpc.billing.unpaid.list.queryOptions({
					input: {
						organizationId: data.organizationId,
						pageSize: 50,
					},
				}),
			),
			queryClient.ensureQueryData(
				orpc.billing.collectors.stats.queryOptions({
					input: { organizationId: data.organizationId },
				}),
			),
		]);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	});

export const Route = createFileRoute("/_collector/collect/$organizationSlug/")({
	loader: async ({ context }) => {
		return getCollectorDataFn({
			data: { organizationId: context.organization.id },
		});
	},
	component: CollectorPage,
});

function CollectorPage() {
	const loaderData = Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={<CollectorPortalSkeleton />}
			dehydratedState={loaderData.dehydratedState}
		>
			<CollectorPortal />
		</AsyncBoundary>
	);
}

import { config } from "@repo/config";
import { InsightsPage, InsightsSkeleton } from "@saas/insights/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

/**
 * Prefetch the headline numbers on the server.
 *
 * Only the summary is prefetched — it is the one query the page cannot render
 * without. Trend, breakdown and money map load client-side so a slow aggregate
 * never delays the sentence the owner actually came to read.
 */
const getInsightsFn = createServerFn({ method: "GET" })
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
				orpc.finance.summary.queryOptions({
					input: {
						organizationId: organization.id,
						period: "this-month",
					},
				}),
			);
		} catch {
			// A failed prefetch must not blank the page — the client retries
			// and AsyncBoundary shows the error there if it persists.
			return { dehydratedState: null };
		}

		return {
			// react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone -- intentional SSR serialization of dehydrated query cache (strips non-serializable values for the client payload); canonical pattern per CLAUDE.md
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	});

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/insights/",
)({
	loader: ({ params }) =>
		getInsightsFn({ data: { organizationSlug: params.organizationSlug } }),
	head: () => ({
		meta: [{ title: `How the business is doing - ${config.appName}` }],
	}),
	component: InsightsRoute,
});

function InsightsRoute() {
	const loaderData = Route.useLoaderData();

	return (
		<PermissionGate resource="billing" action="view">
			<AsyncBoundary
				fallback={<InsightsSkeleton />}
				dehydratedState={loaderData.dehydratedState}
			>
				<InsightsPage />
			</AsyncBoundary>
		</PermissionGate>
	);
}

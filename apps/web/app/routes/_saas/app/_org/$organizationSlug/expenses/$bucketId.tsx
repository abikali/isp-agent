import { config } from "@repo/config";
import { BucketDetailPage, BucketDetailSkeleton } from "@saas/expenses/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getBucketFn = createServerFn({ method: "GET" })
	.inputValidator(
		(data: { organizationSlug: string; bucketId: string }) => data,
	)
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
			await Promise.all([
				queryClient.ensureQueryData(
					orpc.expenses.bucket.queryOptions({
						input: {
							organizationId: organization.id,
							bucketId: data.bucketId,
						},
					}),
				),
				queryClient.ensureQueryData(
					orpc.expenses.overview.queryOptions({
						input: { organizationId: organization.id },
					}),
				),
			]);
		} catch {
			return { dehydratedState: null };
		}

		return {
			// react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone -- intentional SSR serialization of dehydrated query cache (strips non-serializable values for the client payload); canonical pattern per CLAUDE.md
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	});

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/expenses/$bucketId",
)({
	loader: ({ params }) =>
		getBucketFn({
			data: {
				organizationSlug: params.organizationSlug,
				bucketId: params.bucketId,
			},
		}),
	head: () => ({
		meta: [{ title: `Spending bucket - ${config.appName}` }],
	}),
	component: BucketRoute,
});

function BucketRoute() {
	const { bucketId } = Route.useParams();
	const loaderData = Route.useLoaderData();

	return (
		<PermissionGate resource="expenses" action="read">
			<AsyncBoundary
				fallback={<BucketDetailSkeleton />}
				dehydratedState={loaderData.dehydratedState}
				resetKeys={[bucketId]}
			>
				<BucketDetailPage bucketId={bucketId} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

import { config } from "@repo/config";
import { CustomersList, CustomersListSkeleton } from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/",
)({
	head: () => ({
		meta: [{ title: `Customers - ${config.appName}` }],
	}),
	// Server-side prefetch of the queries this page fires, so it ships
	// already-populated instead of firing a cold ~7-RPC client waterfall after
	// hydration. That waterfall is the source of the intermittent "page hangs
	// ~1s" reports: a single user's burst pins to one cluster worker (HTTP
	// keep-alive) and queues behind itself when that worker hits an SSR/GC blip.
	//
	// - The oRPC client is isomorphic: on the server it calls the router
	//   directly (in-process, no HTTP), so this is one parallel batch of
	//   in-process queries during SSR, not 7 network round-trips.
	// - Inputs MUST match the components' initial-render query keys or the
	//   client just refetches. First render: filters = DEFAULT_FILTERS (all
	//   resolve to undefined), search = "" (omitted), page = 1, no sort — so
	//   customers.list keys on { organizationId, page: 1 }; the rest on
	//   { organizationId }. A mismatch is harmless — it falls back to a client
	//   fetch (no regression, no hydration error).
	// - Promise.allSettled: a failed prefetch (e.g. a cold iRadius/billing
	//   tunnel) is non-fatal and degrades to a client fetch.
	loader: async ({ context }) => {
		const organizationId = (
			context as { organization: { id: string } }
		).organization.id;

		const queryClient = getServerQueryClient();

		await Promise.allSettled([
			queryClient.ensureQueryData(
				orpc.customers.list.queryOptions({
					input: { organizationId, page: 1 },
				}),
			),
			queryClient.ensureQueryData(
				orpc.customers.stats.queryOptions({
					input: { organizationId },
				}),
			),
			queryClient.ensureQueryData(
				orpc.servicePlans.list.queryOptions({
					input: { organizationId },
				}),
			),
			queryClient.ensureQueryData(
				orpc.stations.list.queryOptions({
					input: { organizationId },
				}),
			),
			queryClient.ensureQueryData(
				orpc.billing.groups.list.queryOptions({
					input: { organizationId },
				}),
			),
			queryClient.ensureQueryData(
				orpc.billing.collectors.list.queryOptions({
					input: { organizationId },
				}),
			),
			queryClient.ensureQueryData(
				orpc.organizations.getIradiusStatus.queryOptions({
					input: { organizationId },
				}),
			),
		]);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	component: CustomersPage,
});

function CustomersPage() {
	const { organizationSlug } = Route.useParams();
	const { dehydratedState } = Route.useLoaderData();

	return (
		<PermissionGate resource="customers" action="read">
			<AsyncBoundary
				dehydratedState={dehydratedState}
				fallback={
					<PageShellSkeleton>
						<CustomersListSkeleton />
					</PageShellSkeleton>
				}
			>
				<CustomersList organizationSlug={organizationSlug} />
			</AsyncBoundary>
		</PermissionGate>
	);
}

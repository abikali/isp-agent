import { config } from "@repo/config";
import {
	ADMIN_ORGANIZATIONS_ITEMS_PER_PAGE,
	OrganizationList,
	OrganizationListSkeleton,
} from "@saas/admin/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Search params schema for admin organizations list.
 * Validated by TanStack Router on navigation.
 */
const adminOrganizationsSearchSchema = z.object({
	currentPage: z.number().default(1),
	query: z.string().default(""),
});

export type AdminOrganizationsSearch = z.infer<
	typeof adminOrganizationsSearchSchema
>;

const getOrganizationsDataFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const queryClient = getServerQueryClient();

		try {
			// Prefetch first page with default params
			await queryClient.ensureQueryData(
				orpc.admin.organizations.list.queryOptions({
					input: {
						itemsPerPage: ADMIN_ORGANIZATIONS_ITEMS_PER_PAGE,
						currentPage: 1,
						searchTerm: "",
					},
				}),
			);

			return {
				dehydratedState: JSON.parse(
					JSON.stringify(dehydrate(queryClient)),
				),
			};
		} catch {
			return { dehydratedState: null };
		}
	},
);

export const Route = createFileRoute(
	"/_saas/app/_account/admin/organizations/",
)({
	validateSearch: adminOrganizationsSearchSchema,
	loader: () => getOrganizationsDataFn(),
	head: () => ({
		meta: [{ title: `Organizations - Admin - ${config.appName}` }],
	}),
	component: AdminOrganizationsPage,
});

function AdminOrganizationsPage() {
	const loaderData = Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={<OrganizationListSkeleton />}
			dehydratedState={loaderData.dehydratedState}
		>
			<OrganizationList />
		</AsyncBoundary>
	);
}

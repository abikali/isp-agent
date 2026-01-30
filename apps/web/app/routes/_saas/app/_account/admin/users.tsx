import { config } from "@repo/config";
import {
	ADMIN_USERS_ITEMS_PER_PAGE,
	UserList,
	UserListSkeleton,
} from "@saas/admin/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Search params schema for admin users list.
 * Validated by TanStack Router on navigation.
 */
const adminUsersSearchSchema = z.object({
	currentPage: z.number().default(1),
	query: z.string().default(""),
});

export type AdminUsersSearch = z.infer<typeof adminUsersSearchSchema>;

const getUsersDataFn = createServerFn({ method: "GET" }).handler(async () => {
	const queryClient = getServerQueryClient();

	try {
		// Prefetch first page with default params
		await queryClient.ensureQueryData(
			orpc.admin.users.list.queryOptions({
				input: {
					itemsPerPage: ADMIN_USERS_ITEMS_PER_PAGE,
					currentPage: 1,
					searchTerm: "",
				},
			}),
		);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	} catch {
		return { dehydratedState: null };
	}
});

export const Route = createFileRoute("/_saas/app/_account/admin/users")({
	validateSearch: adminUsersSearchSchema,
	loader: () => getUsersDataFn(),
	head: () => ({
		meta: [{ title: `Users - Admin - ${config.appName}` }],
	}),
	component: AdminUsersPage,
});

function AdminUsersPage() {
	const loaderData = Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={<UserListSkeleton />}
			dehydratedState={loaderData.dehydratedState}
		>
			<UserList />
		</AsyncBoundary>
	);
}

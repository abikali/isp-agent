import { config } from "@repo/config";
import { getAdminPath } from "@saas/admin";
import { OrganizationForm } from "@saas/admin/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import { ArrowLeftIcon } from "lucide-react";

const getOrganizationDataFn = createServerFn({ method: "GET" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const queryClient = getServerQueryClient();

		if (data.id !== "new") {
			await queryClient.prefetchQuery(
				orpc.admin.organizations.find.queryOptions({
					input: { id: data.id },
				}),
			);
		}

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	});

export const Route = createFileRoute(
	"/_saas/app/_account/admin/organizations/$id",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		backTo: (search.backTo as string) || undefined,
	}),
	loader: ({ params }) => getOrganizationDataFn({ data: { id: params.id } }),
	head: () => ({
		meta: [{ title: `Edit Organization - Admin - ${config.appName}` }],
	}),
	component: AdminOrganizationDetailPage,
});

function OrganizationFormSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-2/3" />
			<Skeleton className="h-10 w-1/3" />
		</div>
	);
}

function AdminOrganizationDetailPage() {
	const loaderData = Route.useLoaderData();
	const { id } = Route.useParams();
	const { backTo } = Route.useSearch();

	return (
		<div>
			<div className="mb-2 flex justify-start">
				<Button variant="link" size="sm" asChild className="px-0">
					<Link to={backTo ?? getAdminPath("/organizations")}>
						<ArrowLeftIcon className="mr-1.5 size-4" />
						Back to list
					</Link>
				</Button>
			</div>
			<AsyncBoundary
				fallback={<OrganizationFormSkeleton />}
				dehydratedState={loaderData.dehydratedState}
			>
				<OrganizationForm organizationId={id} />
			</AsyncBoundary>
		</div>
	);
}

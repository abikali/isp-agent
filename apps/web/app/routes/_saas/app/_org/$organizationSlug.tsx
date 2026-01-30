import type { ActiveOrganization } from "@repo/auth";
import { AppNotFound, AppWrapper } from "@saas/shared/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Inline query key factory (matches organizationsQueryKeys.active() from "@saas/organizations/lib/api")
const activeOrganizationQueryKey = (slug: string) =>
	["user", "activeOrganization", slug] as const;

const getOrganizationFn = createServerFn({ method: "GET" })
	.inputValidator((data: { organizationSlug: string }) => data)
	.handler(async ({ data }: { data: { organizationSlug: string } }) => {
		// Dynamic imports to prevent server code from being bundled for client
		const { authApi } = await import("@repo/auth");
		const { logger } = await import("@repo/logs");

		try {
			const organization = await authApi.getFullOrganization({
				query: {
					organizationSlug: data.organizationSlug,
				},
				headers: getRequest().headers,
			});

			if (!organization) {
				return null;
			}

			return organization;
		} catch (error) {
			logger.error("Failed to get active organization", {
				slug: data.organizationSlug,
				error,
			});
			return null;
		}
	});

export const Route = createFileRoute("/_saas/app/_org/$organizationSlug")({
	// beforeLoad fetches org and makes it available to child route loaders via context
	beforeLoad: async ({ params }) => {
		const organization = await getOrganizationFn({
			data: { organizationSlug: params.organizationSlug },
		});

		if (!organization) {
			throw notFound();
		}

		// This context is available to all child route loaders
		return { organization };
	},
	// loader receives the organization from beforeLoad context and handles hydration
	loader: ({ context, params }) => {
		const queryClient = getServerQueryClient();

		// Hydrate organization to React Query cache for client
		queryClient.setQueryData(
			activeOrganizationQueryKey(params.organizationSlug),
			context.organization,
		);

		return {
			organization: context.organization as ActiveOrganization,
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	component: OrganizationLayout,
	notFoundComponent: OrganizationNotFound,
});

function OrganizationNotFound() {
	return (
		<AppWrapper>
			<AppNotFound />
		</AppWrapper>
	);
}

function OrganizationLayout() {
	const loaderData = Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={null}
			dehydratedState={loaderData.dehydratedState}
		>
			<AppWrapper>
				<Outlet />
			</AppWrapper>
		</AsyncBoundary>
	);
}

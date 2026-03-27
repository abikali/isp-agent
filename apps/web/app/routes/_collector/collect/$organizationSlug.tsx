import type { ActiveOrganization } from "@repo/auth";
import { CollectorShell } from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const activeOrganizationQueryKey = (slug: string) =>
	["user", "activeOrganization", slug] as const;

const getOrganizationFn = createServerFn({ method: "GET" })
	.inputValidator((data: { organizationSlug: string }) => data)
	.handler(async ({ data }: { data: { organizationSlug: string } }) => {
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

export const Route = createFileRoute("/_collector/collect/$organizationSlug")({
	beforeLoad: async ({ params }) => {
		const organization = await getOrganizationFn({
			data: { organizationSlug: params.organizationSlug },
		});

		if (!organization) {
			throw notFound();
		}

		return { organization };
	},
	loader: ({ context, params }) => {
		const queryClient = getServerQueryClient();

		queryClient.setQueryData(
			activeOrganizationQueryKey(params.organizationSlug),
			context.organization,
		);

		return {
			organization: context.organization as ActiveOrganization,
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	component: CollectorOrganizationLayout,
});

function CollectorOrganizationLayout() {
	const loaderData = Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={null}
			dehydratedState={loaderData.dehydratedState}
		>
			<CollectorShell>
				<Outlet />
			</CollectorShell>
		</AsyncBoundary>
	);
}

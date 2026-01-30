import { AppNotFound, AppWrapperFullBleed } from "@saas/shared/client";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

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
				// Return null - let the loader handle notFound()
				return null;
			}

			return { organization };
		} catch (error) {
			logger.error("Failed to get active organization", {
				slug: data.organizationSlug,
				error,
			});
			// Return null on error - let the loader handle notFound()
			return null;
		}
	});

export const Route = createFileRoute("/_saas/app/_fullbleed/$organizationSlug")(
	{
		// beforeLoad fetches org and makes it available to child route loaders via context
		beforeLoad: async ({ params }) => {
			const result = await getOrganizationFn({
				data: { organizationSlug: params.organizationSlug },
			});

			if (!result?.organization) {
				throw notFound();
			}

			// This context is available to all child route loaders
			return { organization: result.organization };
		},
		// loader receives organization from beforeLoad context
		loader: ({ context }) => {
			return { organization: context.organization };
		},
		component: FullBleedOrganizationLayout,
		notFoundComponent: FullBleedNotFound,
	},
);

function FullBleedNotFound() {
	return (
		<AppWrapperFullBleed>
			<AppNotFound />
		</AppWrapperFullBleed>
	);
}

function FullBleedOrganizationLayout() {
	// Organization is guaranteed to exist (beforeLoad throws notFound() otherwise)
	return (
		<AppWrapperFullBleed>
			<Outlet />
		</AppWrapperFullBleed>
	);
}

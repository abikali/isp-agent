import type { ActiveOrganization } from "@repo/auth";
import { AppNotFound, AppWrapper } from "@saas/shared/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import {
	createFileRoute,
	notFound,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ShieldAlertIcon } from "lucide-react";

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
			const { db } = await import("@repo/database");

			// Run auth API and DB query in parallel (slug is unique)
			const [organization, orgData] = await Promise.all([
				authApi.getFullOrganization({
					query: {
						organizationSlug: data.organizationSlug,
					},
					headers: getRequest().headers,
				}),
				db.organization.findUnique({
					where: { slug: data.organizationSlug },
					select: { activeDealerId: true },
				}),
			]);

			if (!organization) {
				return null;
			}

			return {
				...organization,
				activeDealerId: orgData?.activeDealerId ?? null,
			};
		} catch (error) {
			logger.error("Failed to get active organization", {
				slug: data.organizationSlug,
				error,
			});
			return null;
		}
	});

const getEmployeeLayoutFn = createServerFn({ method: "GET" })
	.inputValidator((data: { organizationId: string; userId: string }) => data)
	.handler(async ({ data }) => {
		const { db } = await import("@repo/database");
		const employee = await db.employee.findFirst({
			where: {
				organizationId: data.organizationId,
				userId: data.userId,
			},
			select: { preferredLayout: true },
		});
		return employee?.preferredLayout ?? "standard";
	});

export const Route = createFileRoute("/_saas/app/_org/$organizationSlug")({
	// beforeLoad fetches org and makes it available to child route loaders via context
	beforeLoad: async ({ params, context }) => {
		const organization = await getOrganizationFn({
			data: { organizationSlug: params.organizationSlug },
		});

		if (!organization) {
			throw notFound();
		}

		// Check if employee should be redirected to collector portal
		const session = (context as { session?: { user?: { id: string } } })
			.session;
		if (session?.user?.id) {
			const layout = await getEmployeeLayoutFn({
				data: {
					organizationId: organization.id,
					userId: session.user.id,
				},
			});
			if (layout === "collector") {
				throw redirect({
					to: "/collect/$organizationSlug",
					params: { organizationSlug: params.organizationSlug },
				});
			}
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
			organization: context.organization as ActiveOrganization & {
				activeDealerId: string | null;
			},
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

	if (!loaderData.organization.activeDealerId) {
		return (
			<AppWrapper>
				<NoDealerAssigned
					organizationName={loaderData.organization.name}
				/>
			</AppWrapper>
		);
	}

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

function NoDealerAssigned({ organizationName }: { organizationName: string }) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-8">
			<div className="mx-auto max-w-md text-center">
				<div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
					<ShieldAlertIcon className="size-8 text-amber-600" />
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					No Dealer Assigned
				</h1>
				<p className="mt-3 text-muted-foreground">
					<strong>{organizationName}</strong> does not have a dealer
					assigned yet. A dealer must be configured before you can
					access any data.
				</p>
				<p className="mt-4 text-sm text-muted-foreground">
					Please contact your administrator to assign a dealer to this
					organization.
				</p>
			</div>
		</div>
	);
}

import type { ActiveOrganization } from "@repo/auth";
import { config } from "@repo/config";
import { NoDealerAssigned } from "@saas/organizations/client";
import { WorkerShell } from "@saas/worker/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { getBeirutDate } from "@shared/lib/format";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";

const activeOrganizationQueryKey = (slug: string) =>
	["user", "activeOrganization", slug] as const;

const getOrganizationFn = createServerFn({ method: "GET" })
	.inputValidator((data: { organizationSlug: string }) => data)
	.handler(async ({ data }: { data: { organizationSlug: string } }) => {
		const { authApi } = await import("@repo/auth");
		const { logger } = await import("@repo/logs");

		try {
			const { db } = await import("@repo/database");

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

export const Route = createFileRoute("/_worker/work/$organizationSlug")({
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
			organization: context.organization as ActiveOrganization & {
				activeDealerId: string | null;
			},
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	component: WorkerOrganizationLayout,
	notFoundComponent: WorkerNotFound,
});

function WorkerOrganizationLayout() {
	const loaderData = Route.useLoaderData();

	if (!loaderData.organization.activeDealerId) {
		return (
			<NoDealerAssigned
				organizationName={loaderData.organization.name}
				fullScreen
			/>
		);
	}

	return (
		<AsyncBoundary
			fallback={null}
			dehydratedState={loaderData.dehydratedState}
		>
			<WorkerShell>
				<Outlet />
			</WorkerShell>
		</AsyncBoundary>
	);
}

function WorkerNotFound() {
	return (
		<div className="flex min-h-screen flex-col bg-background">
			<main className="flex flex-1 items-center justify-center p-4">
				<div className="w-full max-w-md space-y-6 text-center">
					<div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
						<SearchIcon className="size-10 text-muted-foreground" />
					</div>

					<div className="space-y-2">
						<p className="text-6xl font-bold text-muted-foreground/50">
							404
						</p>
						<h1 className="text-2xl font-semibold tracking-tight">
							Organization not found
						</h1>
						<p className="text-muted-foreground">
							This organization doesn't exist or you don't have
							access to it.
						</p>
					</div>

					<div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
						<button
							type="button"
							onClick={() => window.history.back()}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							<ArrowLeftIcon className="size-4" />
							Go back
						</button>
					</div>
				</div>
			</main>

			<footer className="py-6 text-center text-xs text-muted-foreground">
				<span>
					&copy; {getBeirutDate().year} {config.appName}
				</span>
			</footer>
		</div>
	);
}

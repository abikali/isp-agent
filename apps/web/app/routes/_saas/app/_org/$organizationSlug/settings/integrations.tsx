import { config } from "@repo/config";
import {
	ConnectedIntegrations,
	ConnectedIntegrationsSkeleton,
	IntegrationsGrid,
	IntegrationsGridSkeleton,
} from "@saas/integrations/index.client";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/integrations",
)({
	// Organization is available from parent's beforeLoad context
	loader: async ({ context }) => {
		const { organization } = context;
		const queryClient = getServerQueryClient();

		// Prefetch integration connections into React Query cache
		await queryClient.ensureQueryData(
			orpc.integrations.listConnections.queryOptions({
				input: { organizationId: organization.id },
			}),
		);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
			organizationId: organization.id,
		};
	},
	head: () => ({
		meta: [{ title: `Integrations - ${config.appName}` }],
	}),
	component: OrganizationIntegrationsPage,
});

function OrganizationIntegrationsPage() {
	const loaderData = Route.useLoaderData();

	const skeleton = (
		<>
			<ConnectedIntegrationsSkeleton />
			<IntegrationsGridSkeleton />
		</>
	);

	return (
		<SettingsList>
			<AsyncBoundary
				fallback={skeleton}
				dehydratedState={loaderData.dehydratedState}
			>
				<ConnectedIntegrations
					organizationId={loaderData.organizationId}
				/>
				<IntegrationsGrid organizationId={loaderData.organizationId} />
			</AsyncBoundary>
		</SettingsList>
	);
}

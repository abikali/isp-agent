import { config } from "@repo/config";
import {
	ApiKeysList,
	ApiKeysListSkeleton,
} from "@saas/organizations/components/ApiKeysList";
import { CreateApiKeyForm } from "@saas/organizations/components/CreateApiKeyForm";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/api-keys",
)({
	// Organization is available from parent's beforeLoad context
	loader: async ({ context }) => {
		const { organization } = context;
		const queryClient = getServerQueryClient();

		// Prefetch API keys into React Query cache
		await queryClient.ensureQueryData(
			orpc.apiKeys.list.queryOptions({
				input: { organizationId: organization.id },
			}),
		);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	head: () => ({
		meta: [{ title: `API Keys - ${config.appName}` }],
	}),
	component: OrganizationApiKeysPage,
});

function OrganizationApiKeysPage() {
	const loaderData = Route.useLoaderData();

	return (
		<SettingsList>
			<CreateApiKeyForm />
			<AsyncBoundary
				fallback={<ApiKeysListSkeleton />}
				dehydratedState={loaderData.dehydratedState}
			>
				<ApiKeysList />
			</AsyncBoundary>
		</SettingsList>
	);
}

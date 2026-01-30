import { config } from "@repo/config";
// Import directly to avoid circular dependency warnings in SSR build
import { CreateWebhookForm } from "@saas/organizations/components/CreateWebhookForm";
import {
	WebhooksList,
	WebhooksListSkeleton,
} from "@saas/organizations/components/WebhooksList";
import { SettingsList } from "@saas/shared/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/webhooks",
)({
	// Organization is available from parent's beforeLoad context
	loader: async ({ context }) => {
		const { organization } = context;
		const queryClient = getServerQueryClient();

		// Prefetch webhooks into React Query cache
		await queryClient.ensureQueryData(
			orpc.webhooks.list.queryOptions({
				input: { organizationId: organization.id },
			}),
		);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	head: () => ({
		meta: [{ title: `Webhooks - ${config.appName}` }],
	}),
	component: OrganizationWebhooksPage,
});

function OrganizationWebhooksPage() {
	const loaderData = Route.useLoaderData();

	return (
		<SettingsList>
			<CreateWebhookForm />
			<AsyncBoundary
				fallback={<WebhooksListSkeleton />}
				dehydratedState={loaderData.dehydratedState}
			>
				<WebhooksList />
			</AsyncBoundary>
		</SettingsList>
	);
}

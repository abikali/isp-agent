import { orpcClient } from "@shared/lib/orpc";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/conversations/open",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		phone: typeof search.phone === "string" ? search.phone : "",
		name: typeof search.name === "string" ? search.name : undefined,
	}),
	loaderDeps: ({ search: { phone, name } }) => ({ phone, name }),
	loader: async ({ context, params, deps }) => {
		const { organization } = context;
		if (!deps.phone) {
			throw redirect({
				to: "/app/$organizationSlug/conversations",
				params: { organizationSlug: params.organizationSlug },
			});
		}
		const { conversationId } =
			await orpcClient.aiAgents.openConversationByPhone({
				organizationId: organization.id,
				phone: deps.phone,
				contactName: deps.name,
			});
		throw redirect({
			to: "/app/$organizationSlug/conversations/$conversationId",
			params: {
				organizationSlug: params.organizationSlug,
				conversationId,
			},
		});
	},
});

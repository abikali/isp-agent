import { config } from "@repo/config";
import { ConversationsHub } from "@saas/ai-agents/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/conversations/",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Conversations - ${config.appName}` }],
	}),
	component: ConversationsPage,
});

function ConversationsPage() {
	const { organizationSlug } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<div>
			<h1 className="mb-6 text-2xl font-bold">Conversations</h1>
			<ConversationsHub
				organizationId={organizationId}
				organizationSlug={organizationSlug}
			/>
		</div>
	);
}

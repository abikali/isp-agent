import { config } from "@repo/config";
import { ConversationsHub } from "@saas/ai-agents/client";
import { PermissionGate } from "@shared/components/PermissionGate";
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
		<PermissionGate resource="aiAgents" action="read">
			<div className="flex h-svh flex-col p-2 md:p-3">
				<ConversationsHub
					organizationId={organizationId}
					organizationSlug={organizationSlug}
				/>
			</div>
		</PermissionGate>
	);
}

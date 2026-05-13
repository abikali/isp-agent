import { config } from "@repo/config";
import {
	ConversationThread,
	ConversationThreadSkeleton,
} from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/ai-agents/$agentId/conversations/$conversationId",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Conversation - ${config.appName}` }],
	}),
	component: ConversationPage,
});

function ConversationPage() {
	const { organizationSlug, agentId, conversationId } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={
				<PageShellSkeleton showActions={false}>
					<ConversationThreadSkeleton />
				</PageShellSkeleton>
			}
		>
			<ConversationThread
				conversationId={conversationId}
				agentId={agentId}
				organizationId={organizationId}
				organizationSlug={organizationSlug}
			/>
		</AsyncBoundary>
	);
}

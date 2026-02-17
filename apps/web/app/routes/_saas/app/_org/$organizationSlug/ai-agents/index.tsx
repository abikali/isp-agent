import { config } from "@repo/config";
import { AgentsList, AgentsListSkeleton } from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/ai-agents/",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `AI Agents - ${config.appName}` }],
	}),
	component: AiAgentsPage,
});

function AiAgentsPage() {
	const { organizationSlug } = Route.useParams();

	return (
		<AsyncBoundary fallback={<AgentsListSkeleton />}>
			<AgentsList organizationSlug={organizationSlug} />
		</AsyncBoundary>
	);
}

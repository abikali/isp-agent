import { config } from "@repo/config";
import { AgentStats, AgentStatsSkeleton } from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/ai-agents/$agentId/stats",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Agent Stats - ${config.appName}` }],
	}),
	component: StatsPage,
});

function StatsPage() {
	const { agentId } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<div>
			<h1 className="mb-6 text-2xl font-bold">Agent Statistics</h1>
			<AsyncBoundary fallback={<AgentStatsSkeleton />}>
				<AgentStats agentId={agentId} organizationId={organizationId} />
			</AsyncBoundary>
		</div>
	);
}

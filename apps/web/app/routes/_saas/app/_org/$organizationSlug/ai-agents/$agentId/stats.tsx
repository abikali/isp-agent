import { config } from "@repo/config";
import { AgentStats, AgentStatsSkeleton } from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/ai-agents/$agentId/stats",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Agent stats - ${config.appName}` }],
	}),
	component: StatsPage,
});

function StatsPage() {
	const { agentId, organizationSlug } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<PermissionGate resource="aiAgents" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<AgentStatsSkeleton />
					</PageShellSkeleton>
				}
			>
				<PageShell
					title="Agent statistics"
					backTo={`/app/${organizationSlug}/ai-agents/${agentId}`}
					backLabel="Agent"
				>
					<AgentStats
						agentId={agentId}
						organizationId={organizationId}
					/>
				</PageShell>
			</AsyncBoundary>
		</PermissionGate>
	);
}

import { config } from "@repo/config";
import {
	AgentDetailShell,
	AgentDetailShellSkeleton,
} from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShellSkeleton } from "@shared/components/PageShellSkeleton";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/ai-agents/$agentId/",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Agent - ${config.appName}` }],
	}),
	component: AgentDetailPage,
});

function AgentDetailPage() {
	const { organizationSlug, agentId } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<PermissionGate resource="aiAgents" action="read">
			<AsyncBoundary
				fallback={
					<PageShellSkeleton>
						<AgentDetailShellSkeleton />
					</PageShellSkeleton>
				}
			>
				<AgentDetailShell
					agentId={agentId}
					organizationId={organizationId}
					organizationSlug={organizationSlug}
				/>
			</AsyncBoundary>
		</PermissionGate>
	);
}

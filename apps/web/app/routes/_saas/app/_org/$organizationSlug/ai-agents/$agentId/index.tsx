import { config } from "@repo/config";
import {
	AgentDebugChat,
	AgentSettings,
	AgentStats,
	AgentStatsSkeleton,
	AgentsListSkeleton,
	ChannelsList,
	ConversationsList,
	WebChatSettings,
} from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import {
	BarChartIcon,
	BugIcon,
	MessageSquareIcon,
	SettingsIcon,
	Share2Icon,
} from "lucide-react";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/ai-agents/$agentId/",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Agent Settings - ${config.appName}` }],
	}),
	component: AgentDetailPage,
});

function AgentDetailPage() {
	const { organizationSlug, agentId } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<PermissionGate resource="aiAgents" action="read">
			<Tabs defaultValue="settings" className="space-y-6">
				<TabsList className="w-full justify-start overflow-x-auto">
					<TabsTrigger value="settings" className="gap-1.5">
						<SettingsIcon className="size-3.5" />
						<span className="hidden sm:inline">Settings</span>
					</TabsTrigger>
					<TabsTrigger value="integrations" className="gap-1.5">
						<Share2Icon className="size-3.5" />
						<span className="hidden sm:inline">Integrations</span>
					</TabsTrigger>
					<TabsTrigger value="conversations" className="gap-1.5">
						<MessageSquareIcon className="size-3.5" />
						<span className="hidden sm:inline">Conversations</span>
					</TabsTrigger>
					<TabsTrigger value="stats" className="gap-1.5">
						<BarChartIcon className="size-3.5" />
						<span className="hidden sm:inline">Stats</span>
					</TabsTrigger>
					<TabsTrigger value="debug" className="gap-1.5">
						<BugIcon className="size-3.5" />
						<span className="hidden sm:inline">Debug</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="settings">
					<AsyncBoundary fallback={<AgentsListSkeleton />}>
						<AgentSettings
							agentId={agentId}
							organizationId={organizationId}
						/>
					</AsyncBoundary>
				</TabsContent>

				<TabsContent value="integrations" className="space-y-6">
					<AsyncBoundary fallback={<AgentsListSkeleton />}>
						<WebChatSettings
							agentId={agentId}
							organizationId={organizationId}
						/>
					</AsyncBoundary>
					<ChannelsList
						agentId={agentId}
						organizationId={organizationId}
					/>
				</TabsContent>

				<TabsContent value="conversations">
					<ConversationsList
						agentId={agentId}
						organizationId={organizationId}
						organizationSlug={organizationSlug}
					/>
				</TabsContent>

				<TabsContent value="stats">
					<AsyncBoundary fallback={<AgentStatsSkeleton />}>
						<AgentStats
							agentId={agentId}
							organizationId={organizationId}
						/>
					</AsyncBoundary>
				</TabsContent>

				<TabsContent value="debug">
					<AgentDebugChat agentId={agentId} />
				</TabsContent>
			</Tabs>
		</PermissionGate>
	);
}

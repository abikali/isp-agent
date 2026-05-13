"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import {
	DetailPanel,
	DetailPanelSkeleton,
} from "@shared/components/DetailPanel";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import {
	BarChartIcon,
	BugIcon,
	MessageSquareIcon,
	SettingsIcon,
	Share2Icon,
} from "lucide-react";
import {
	AgentDebugChat,
	AgentSettings,
	AgentStats,
	AgentStatsSkeleton,
	AgentsListSkeleton,
	ChannelsList,
	ConversationsList,
	WebChatSettings,
} from "../index.client";

interface AgentDetailShellProps {
	agentId: string;
	organizationId: string;
	organizationSlug: string;
}

/**
 * Detail shell for a single AI agent. Wraps the previously-bare tabs page in
 * the standard PageShell + DetailPanel pattern so the agent detail matches
 * the look-and-feel of customer / dealer / employee detail pages.
 */
export function AgentDetailShell({
	agentId,
	organizationId,
	organizationSlug,
}: AgentDetailShellProps) {
	const { data } = useSuspenseQuery(
		orpc.aiAgents.getAgent.queryOptions({
			input: { agentId, organizationId },
		}),
	);
	const agent = data.agent;

	const statusType = agent.maintenanceMode
		? "suspended"
		: agent.enabled
			? "active"
			: "inactive";
	const statusLabel = agent.maintenanceMode
		? "Maintenance"
		: agent.enabled
			? "Active"
			: "Disabled";

	return (
		<PageShell
			title={agent.name}
			backTo={`/app/${organizationSlug}/ai-agents`}
			backLabel="AI agents"
			subtitle={
				<span className="flex flex-wrap items-center gap-2 sm:gap-3">
					<StatusIndicator
						status={statusType}
						label={statusLabel}
						variant="badge"
					/>
					<Badge variant="outline" className="font-mono text-[10px]">
						{agent.model}
					</Badge>
					{agent.description && (
						<span className="truncate text-xs text-muted-foreground">
							{agent.description}
						</span>
					)}
				</span>
			}
		>
			<DetailPanel
				tabs={[
					{
						id: "settings",
						label: "Settings",
						icon: SettingsIcon,
						content: (
							<AsyncBoundary fallback={<AgentsListSkeleton />}>
								<AgentSettings
									agentId={agentId}
									organizationId={organizationId}
								/>
							</AsyncBoundary>
						),
					},
					{
						id: "integrations",
						label: "Integrations",
						icon: Share2Icon,
						content: (
							<AsyncBoundary fallback={<AgentsListSkeleton />}>
								<div className="space-y-3">
									<WebChatSettings
										agentId={agentId}
										organizationId={organizationId}
									/>
									<ChannelsList
										agentId={agentId}
										organizationId={organizationId}
									/>
								</div>
							</AsyncBoundary>
						),
					},
					{
						id: "conversations",
						label: "Conversations",
						icon: MessageSquareIcon,
						content: (
							<ConversationsList
								agentId={agentId}
								organizationId={organizationId}
								organizationSlug={organizationSlug}
							/>
						),
					},
					{
						id: "stats",
						label: "Stats",
						icon: BarChartIcon,
						content: (
							<AsyncBoundary fallback={<AgentStatsSkeleton />}>
								<AgentStats
									agentId={agentId}
									organizationId={organizationId}
								/>
							</AsyncBoundary>
						),
					},
					{
						id: "debug",
						label: "Debug",
						icon: BugIcon,
						content: <AgentDebugChat agentId={agentId} />,
					},
				]}
			/>
		</PageShell>
	);
}

/** Loading state with the same outer chrome as the loaded shell. */
export function AgentDetailShellSkeleton() {
	return <DetailPanelSkeleton tabCount={5} />;
}

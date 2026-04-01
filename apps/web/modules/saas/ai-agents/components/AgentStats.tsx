"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	ClockIcon,
	CoinsIcon,
	MessageSquareIcon,
	UsersIcon,
} from "lucide-react";

export function AgentStats({
	agentId,
	organizationId,
}: {
	agentId: string;
	organizationId: string;
}) {
	const { data } = useSuspenseQuery(
		orpc.aiAgents.getAgentStats.queryOptions({
			input: { agentId, organizationId, period: "30d" },
		}),
	);

	const { stats } = data;

	return (
		<StatCardGroup columns={4}>
			<StatCard
				title="Messages"
				value={stats.totalMessages}
				icon={MessageSquareIcon}
				color="blue"
				description="Last 30 days"
			/>
			<StatCard
				title="Conversations"
				value={stats.conversationsInPeriod}
				icon={UsersIcon}
				color="green"
				description={`${stats.totalConversations} total`}
			/>
			<StatCard
				title="Avg Latency"
				value={stats.avgLatencyMs ? `${stats.avgLatencyMs}ms` : "N/A"}
				icon={ClockIcon}
				color="amber"
			/>
			<StatCard
				title="Tokens Used"
				value={stats.totalTokens}
				icon={CoinsIcon}
				color="purple"
				description="Last 30 days"
			/>
		</StatCardGroup>
	);
}

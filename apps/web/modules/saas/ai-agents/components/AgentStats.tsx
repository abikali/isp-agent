"use client";

import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
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

	const statCards = [
		{
			title: "Messages",
			value: stats.totalMessages.toLocaleString(),
			description: "Last 30 days",
			icon: MessageSquareIcon,
		},
		{
			title: "Conversations",
			value: stats.conversationsInPeriod.toLocaleString(),
			description: `${stats.totalConversations} total`,
			icon: UsersIcon,
		},
		{
			title: "Avg Latency",
			value: stats.avgLatencyMs ? `${stats.avgLatencyMs}ms` : "N/A",
			description: "Response time",
			icon: ClockIcon,
		},
		{
			title: "Tokens Used",
			value: stats.totalTokens.toLocaleString(),
			description: "Last 30 days",
			icon: CoinsIcon,
		},
	];

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{statCards.map((stat) => (
				<Card key={stat.title}>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{stat.title}
						</CardTitle>
						<stat.icon className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">{stat.value}</p>
						<p className="text-xs text-muted-foreground">
							{stat.description}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

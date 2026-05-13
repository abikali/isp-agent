"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import {
	ConversationsPerDayChart,
	ToolInvocationChart,
} from "@shared/components/charts";
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

	const { stats, conversationsSeries, toolBreakdown } = data;

	const conversationsData = conversationsSeries.map((p) => ({
		date: p.day,
		web: p.web,
		whatsapp: p.whatsapp,
		telegram: p.telegram,
	}));

	return (
		<div className="space-y-6">
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
					value={
						stats.avgLatencyMs ? `${stats.avgLatencyMs}ms` : "N/A"
					}
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

			<div className="grid gap-6 lg:grid-cols-3">
				<ContentCard className="lg:col-span-2">
					<ContentCardSection className="border-b border-border">
						<div className="text-sm font-medium">
							Conversations per day
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Last 30 days, by channel
						</p>
					</ContentCardSection>
					<ContentCardSection>
						{conversationsData.every(
							(d) => d.web + d.whatsapp + d.telegram === 0,
						) ? (
							<p className="py-12 text-center text-sm text-muted-foreground">
								No conversations yet
							</p>
						) : (
							<ConversationsPerDayChart
								data={conversationsData}
							/>
						)}
					</ContentCardSection>
				</ContentCard>

				<ContentCard>
					<ContentCardSection className="border-b border-border">
						<div className="text-sm font-medium">Tool calls</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Most-invoked tools
						</p>
					</ContentCardSection>
					<ContentCardSection>
						{toolBreakdown.length === 0 ? (
							<p className="py-12 text-center text-sm text-muted-foreground">
								No tool invocations
							</p>
						) : (
							<ToolInvocationChart
								data={toolBreakdown}
								height={300}
							/>
						)}
					</ContentCardSection>
				</ContentCard>
			</div>
		</div>
	);
}

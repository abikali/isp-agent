"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	Activity,
	AlertCircle,
	AlertTriangle,
	Bot,
	DollarSign,
	UserCheck,
	Users,
} from "lucide-react";

export function StatCards() {
	const organizationId = useOrganizationId();

	const { stats: customerStats, isLoading: isLoadingCustomers } =
		useCustomerStatsQuery(organizationId);
	const { stats: watcherStats, isLoading: isLoadingWatchers } =
		useWatcherStatsQuery(organizationId);
	const { agentCount, isLoading: isLoadingAgents } =
		useAgentCountQuery(organizationId);

	const customerCards = [
		{
			title: "Total Customers",
			value: customerStats?.total ?? 0,
			icon: Users,
		},
		{
			title: "Active",
			value: customerStats?.active ?? 0,
			icon: UserCheck,
		},
		{
			title: "Monthly Revenue",
			value: customerStats
				? `$${customerStats.totalMonthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
				: "$0.00",
			icon: DollarSign,
		},
		{
			title: "Needs Attention",
			value:
				(customerStats?.pending ?? 0) + (customerStats?.suspended ?? 0),
			icon: AlertTriangle,
		},
	];

	const infraCards = [
		{
			title: "Watchers",
			value: watcherStats
				? `${watcherStats.total} (${watcherStats.up} up)`
				: 0,
			icon: Activity,
		},
		{
			title: "Watchers Down",
			value: watcherStats?.down ?? 0,
			highlight: (watcherStats?.down ?? 0) > 0,
			icon: AlertCircle,
		},
		{
			title: "AI Agents",
			value: agentCount,
			icon: Bot,
		},
	];

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{customerCards.map((card) => (
					<StatCard
						key={card.title}
						title={card.title}
						value={card.value}
						icon={card.icon}
						isLoading={isLoadingCustomers}
					/>
				))}
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{infraCards.map((card) => (
					<StatCard
						key={card.title}
						title={card.title}
						value={card.value}
						icon={card.icon}
						isLoading={
							card.title === "AI Agents"
								? isLoadingAgents
								: isLoadingWatchers
						}
						highlight={"highlight" in card ? card.highlight : false}
					/>
				))}
			</div>
		</div>
	);
}

function StatCard({
	title,
	value,
	icon: Icon,
	isLoading,
	highlight,
}: {
	title: string;
	value: string | number;
	icon: React.ComponentType<{ className?: string | undefined }>;
	isLoading: boolean;
	highlight?: boolean | undefined;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
				<Icon className="size-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-7 w-20" />
				) : (
					<div
						className={`text-2xl font-bold ${highlight ? "text-destructive" : ""}`}
					>
						{value}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function useCustomerStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.customers.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["customers", "stats"]),
	);

	return {
		stats: query.data,
		isLoading: query.isLoading,
	};
}

function useWatcherStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.watchers.getStats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["watchers", "getStats"]),
	);

	return {
		stats: query.data,
		isLoading: query.isLoading,
	};
}

function useAgentCountQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.aiAgents.listAgents.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["aiAgents", "listAgents"]),
	);

	return {
		agentCount: query.data?.agents?.length ?? 0,
		isLoading: query.isLoading,
	};
}

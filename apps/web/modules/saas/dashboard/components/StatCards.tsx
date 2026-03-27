"use client";

import {
	StatCard as StatCardComponent,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import { formatCurrency } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Skeleton } from "@ui/components/skeleton";
import {
	Activity,
	AlertCircle,
	AlertTriangle,
	Bot,
	DollarSign,
	HandshakeIcon,
	UserCheck,
	Users,
	UserX,
	Wifi,
	WifiOff,
} from "lucide-react";

export function StatCards() {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });

	const { stats, isLoading: isLoadingStats } =
		useCustomerStatsQuery(organizationId);
	const { stats: watcherStats, isLoading: isLoadingWatchers } =
		useWatcherStatsQuery(organizationId);
	const { agentCount, isLoading: isLoadingAgents } =
		useAgentCountQuery(organizationId);

	return (
		<div className="space-y-6">
			{/* Primary Stats */}
			<StatCardGroup columns={4}>
				{isLoadingStats ? (
					<>
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
					</>
				) : (
					<>
						<StatCardComponent
							title="Online"
							value={stats?.online ?? 0}
							icon={Wifi}
							variant="success"
							description="Currently connected"
						/>
						<StatCardComponent
							title="Offline"
							value={stats?.offline ?? 0}
							icon={WifiOff}
							description="Active but disconnected"
						/>
						<StatCardComponent
							title="Active"
							value={stats?.active ?? 0}
							icon={UserCheck}
							description="Active accounts"
						/>
						<StatCardComponent
							title="Total"
							value={stats?.total ?? 0}
							icon={Users}
							description="All subscribers"
						/>
					</>
				)}
			</StatCardGroup>

			{/* Secondary Stats */}
			<StatCardGroup columns={5}>
				{isLoadingStats ? (
					<>
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
					</>
				) : (
					<>
						<StatCardComponent
							title="Expired"
							value={stats?.expired ?? 0}
							icon={AlertTriangle}
							variant={
								(stats?.expired ?? 0) > 0
									? "warning"
									: "default"
							}
							description="Active accounts past expiry date"
						/>
						<StatCardComponent
							title="Archived"
							value={stats?.inactive ?? 0}
							icon={UserX}
							description="Cancelled subscribers"
						/>
						<StatCardComponent
							title="Revenue"
							value={formatCurrency(
								stats?.totalMonthlyRevenue ?? 0,
							)}
							icon={DollarSign}
							description="Sum of active subscribers' rates"
						/>
						<StatCardComponent
							title="Dealers"
							value={stats?.dealerCount ?? 0}
							icon={HandshakeIcon}
							description="Top-level reseller partners"
						/>
						<StatCardComponent
							title="Employees"
							value={stats?.employeeCount ?? 0}
							icon={Users}
							description="Staff and collectors"
						/>
					</>
				)}
			</StatCardGroup>

			{/* Infrastructure + Plan Distribution */}
			<div className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-xl bg-card p-6 shadow-card space-y-4">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Infrastructure
					</h3>
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 text-sm">
								<Activity className="size-4 text-muted-foreground" />
								Watchers
							</div>
							{isLoadingWatchers ? (
								<Skeleton className="h-5 w-16" />
							) : (
								<span className="text-sm font-medium">
									{watcherStats?.total ?? 0} (
									{watcherStats?.up ?? 0} up)
								</span>
							)}
						</div>
						{(watcherStats?.down ?? 0) > 0 && (
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 text-sm text-destructive">
									<AlertCircle className="size-4" />
									Down
								</div>
								<span className="text-sm font-bold text-destructive">
									{watcherStats?.down}
								</span>
							</div>
						)}
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 text-sm">
								<Bot className="size-4 text-muted-foreground" />
								AI Agents
							</div>
							{isLoadingAgents ? (
								<Skeleton className="h-5 w-8" />
							) : (
								<span className="text-sm font-medium">
									{agentCount}
								</span>
							)}
						</div>
					</div>
				</div>

				<div className="rounded-xl bg-card p-6 shadow-card lg:col-span-2 space-y-4">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Plan Distribution
					</h3>
					{isLoadingStats ? (
						<div className="space-y-2">
							{Array.from({ length: 5 }).map((_, i) => (
								<Skeleton
									key={`plan-skel-${i}`}
									className="h-6 w-full"
								/>
							))}
						</div>
					) : stats?.planDistribution &&
						stats.planDistribution.length > 0 ? (
						<div className="space-y-2">
							{stats.planDistribution.map((plan) => {
								const pct =
									stats.active > 0
										? Math.round(
												(plan.count / stats.active) *
													100,
											)
										: 0;
								return (
									<div
										key={plan.planName}
										className="flex items-center gap-3"
									>
										<div className="flex-1">
											<div className="flex items-center justify-between text-sm">
												<span className="truncate">
													{plan.planName}
												</span>
												<span className="ml-2 font-mono text-xs text-muted-foreground">
													{plan.count}
												</span>
											</div>
											<div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-primary"
													style={{
														width: `${pct}%`,
													}}
												/>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No plan data available
						</p>
					)}
				</div>
			</div>

			{/* Top Dealers */}
			{stats?.topDealers && stats.topDealers.length > 0 && (
				<div className="rounded-xl bg-card p-6 shadow-card space-y-4">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						Top Dealers
					</h3>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{stats.topDealers.map((dealer) => (
							<Link
								key={dealer.id}
								to="/app/$organizationSlug/dealers/$dealerId"
								params={{
									organizationSlug: organizationSlug ?? "",
									dealerId: dealer.id,
								}}
								className="flex items-center justify-between rounded-lg p-3 shadow-card transition-shadow hover:shadow-card-hover"
							>
								<span className="truncate text-sm font-medium">
									{dealer.name}
								</span>
								<Badge variant="secondary">
									{dealer.customerCount}
								</Badge>
							</Link>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function useCustomerStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? {
					...orpc.customers.stats.queryOptions({
						input: { organizationId },
					}),
					refetchInterval: 30_000,
				}
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

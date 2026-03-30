"use client";

import { ChartCard, ChartCardSkeleton } from "@shared/components/ChartCard";
import {
	StatCard as StatCardComponent,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import { formatCurrency } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Progress } from "@ui/components/progress";
import { cn } from "@ui/lib";
import {
	AlertTriangle,
	DollarSign,
	UserCheck,
	Users,
	UserX,
	Wifi,
	WifiOff,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
	Online: "var(--color-chart-3)",
	Offline: "var(--color-chart-1)",
	Active: "var(--color-chart-3)",
	Expired: "var(--color-chart-4)",
	Inactive: "var(--color-chart-1)",
	Suspended: "var(--color-chart-5)",
	Pending: "var(--color-chart-6)",
};

const TASK_COLORS: Record<string, string> = {
	Open: "var(--color-chart-2)",
	"In Progress": "var(--color-chart-6)",
	Completed: "var(--color-chart-3)",
	Overdue: "var(--color-chart-4)",
	"On Hold": "var(--color-chart-5)",
};

export function StatCards() {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });

	const { stats, isLoading: isLoadingStats } =
		useCustomerStatsQuery(organizationId);
	const { stats: watcherStats, isLoading: isLoadingWatchers } =
		useWatcherStatsQuery(organizationId);
	const { stats: taskStats, isLoading: isLoadingTasks } =
		useTaskStatsQuery(organizationId);
	const { stats: billingStats, isLoading: isLoadingBilling } =
		useBillingStatsQuery(organizationId);

	const networkData =
		stats && stats.online + stats.offline > 0
			? [
					{ name: "Online", value: stats.online },
					{ name: "Offline", value: stats.offline },
				]
			: [];

	const customerStatusData =
		stats && stats.total > 0
			? [
					{ name: "Active", value: stats.active },
					{ name: "Expired", value: stats.expired },
					{ name: "Inactive", value: stats.inactive },
					{ name: "Suspended", value: stats.suspended },
					{ name: "Pending", value: stats.pending },
				].filter((d) => d.value > 0)
			: [];

	const taskStatusData = taskStats
		? [
				{ name: "Open", value: taskStats.open },
				{ name: "In Progress", value: taskStats.inProgress },
				{ name: "Completed", value: taskStats.completed },
				{ name: "Overdue", value: taskStats.overdue },
				{ name: "On Hold", value: taskStats.onHold },
			].filter((d) => d.value > 0)
		: [];

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
							variant="success"
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
							title="Employees"
							value={stats?.employeeCount ?? 0}
							icon={Users}
							description="Staff and collectors"
						/>
					</>
				)}
			</StatCardGroup>

			{/* Charts Row */}
			<div className="grid gap-4 lg:grid-cols-3">
				{isLoadingStats ? (
					<ChartCardSkeleton />
				) : networkData.length > 0 ? (
					<StatusPieChart
						title="Network Health"
						data={networkData}
						colorMap={STATUS_COLORS}
						size="lg"
						footer={
							stats && stats.online + stats.offline > 0
								? `${Math.round((stats.online / (stats.online + stats.offline)) * 100)}% uptime`
								: undefined
						}
					/>
				) : (
					<ChartCard title="Network Health">
						<p className="text-sm text-muted-foreground">
							No connectivity data
						</p>
					</ChartCard>
				)}

				{isLoadingStats ? (
					<ChartCardSkeleton />
				) : customerStatusData.length > 0 ? (
					<StatusPieChart
						title="Customer Status"
						data={customerStatusData}
						colorMap={STATUS_COLORS}
						size="lg"
					/>
				) : (
					<ChartCard title="Customer Status">
						<p className="text-sm text-muted-foreground">
							No customer data
						</p>
					</ChartCard>
				)}

				{isLoadingTasks ? (
					<ChartCardSkeleton />
				) : taskStats && taskStats.total > 0 ? (
					<StatusPieChart
						title="Tasks Overview"
						data={taskStatusData}
						colorMap={TASK_COLORS}
						size="lg"
						footer={
							taskStats.unassigned > 0
								? `${taskStats.unassigned} unassigned`
								: undefined
						}
					/>
				) : (
					<ChartCard title="Tasks Overview">
						<p className="text-sm text-muted-foreground">
							No tasks yet
						</p>
					</ChartCard>
				)}
			</div>

			{/* Billing + Dealers Row */}
			<div className="grid gap-4 lg:grid-cols-2">
				{/* Collection Progress */}
				{isLoadingBilling ? (
					<ChartCardSkeleton />
				) : billingStats ? (
					<ChartCard title="Billing Collection">
						<div className="space-y-4">
							<div className="flex items-baseline justify-between">
								<span className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
									{formatCurrency(
										billingStats.totalCollected,
									)}
								</span>
								<span className="text-sm text-muted-foreground">
									collected this cycle
								</span>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">
										Collection rate
									</span>
									<span className="font-medium">
										{billingStats.paidPercentage}%
									</span>
								</div>
								<Progress
									value={billingStats.paidPercentage}
									className="h-2"
								/>
							</div>
							<div className="grid grid-cols-3 gap-4 border-t pt-4">
								<div className="text-center">
									<div className="text-lg font-semibold tabular-nums">
										{billingStats.collectedPayments}
									</div>
									<div className="text-xs text-muted-foreground">
										Collected
									</div>
								</div>
								<div className="text-center">
									<div
										className={cn(
											"text-lg font-semibold tabular-nums",
											billingStats.stoppedPayments > 0 &&
												"text-amber-600 dark:text-amber-400",
										)}
									>
										{billingStats.stoppedPayments}
									</div>
									<div className="text-xs text-muted-foreground">
										Stopped
									</div>
								</div>
								<div className="text-center">
									<div
										className={cn(
											"text-lg font-semibold tabular-nums",
											billingStats.unpaidCustomers > 0 &&
												"text-red-600 dark:text-red-400",
										)}
									>
										{billingStats.unpaidCustomers}
									</div>
									<div className="text-xs text-muted-foreground">
										Unpaid
									</div>
								</div>
							</div>
						</div>
					</ChartCard>
				) : null}
			</div>

			{/* Watcher Alert Bar */}
			{!isLoadingWatchers && watcherStats && watcherStats.down > 0 && (
				<Link
					to="/app/$organizationSlug/watchers"
					params={{ organizationSlug: organizationSlug ?? "" }}
					className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:hover:bg-red-950/50"
				>
					<AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
					<div>
						<span className="text-sm font-medium text-red-700 dark:text-red-300">
							{watcherStats.down} watcher
							{watcherStats.down > 1 ? "s" : ""} down
						</span>
						<span className="ml-2 text-xs text-red-600/70 dark:text-red-400/70">
							{watcherStats.up} of {watcherStats.total} up
						</span>
					</div>
					<span className="ml-auto text-xs text-red-600/70 dark:text-red-400/70">
						View watchers &rarr;
					</span>
				</Link>
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

function useTaskStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.tasks.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["tasks", "stats"]),
	);

	return {
		stats: query.data,
		isLoading: query.isLoading,
	};
}

function useBillingStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "payments", "stats"]),
	);

	return {
		stats: query.data,
		isLoading: query.isLoading,
	};
}

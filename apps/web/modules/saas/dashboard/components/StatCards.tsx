"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import { formatCurrency } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	BanknoteIcon,
	CalendarXIcon,
	ClipboardListIcon,
	DollarSignIcon,
	HandCoinsIcon,
	type LucideIcon,
	OctagonXIcon,
	UserCheckIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
	Online: "var(--chart-2)",
	Offline: "var(--chart-1)",
	Active: "var(--chart-2)",
	Expired: "var(--chart-3)",
	Inactive: "var(--chart-1)",
	Suspended: "var(--chart-5)",
	Pending: "var(--chart-6)",
};

const TASK_COLORS: Record<string, string> = {
	Open: "var(--chart-2)",
	"In Progress": "var(--chart-6)",
	Completed: "var(--chart-3)",
	Overdue: "var(--destructive)",
	"On Hold": "var(--chart-5)",
};

export function StatCards() {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });

	const { stats: customers, isLoading: isLoadingCustomers } =
		useCustomerStatsQuery(organizationId);
	const { stats: watcherStats, isLoading: isLoadingWatchers } =
		useWatcherStatsQuery(organizationId);
	const { stats: taskStats, isLoading: isLoadingTasks } =
		useTaskStatsQuery(organizationId);
	const { stats: billing, isLoading: isLoadingBilling } =
		useBillingStatsQuery(organizationId);

	const networkData =
		customers && customers.online + customers.offline > 0
			? [
					{ name: "Online", value: customers.online },
					{ name: "Offline", value: customers.offline },
				]
			: [];

	const customerStatusData =
		customers && customers.total > 0
			? [
					{ name: "Active", value: customers.active },
					{ name: "Expired", value: customers.expired },
					{ name: "Inactive", value: customers.inactive },
					{ name: "Suspended", value: customers.suspended },
					{ name: "Pending", value: customers.pending },
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

	const base = `/app/${organizationSlug ?? ""}`;

	const isLoading =
		isLoadingCustomers ||
		isLoadingWatchers ||
		isLoadingTasks ||
		isLoadingBilling;

	return (
		<div className="space-y-6">
			{watcherStats && watcherStats.down > 0 && organizationSlug && (
				<Link
					to="/app/$organizationSlug/watchers"
					params={{ organizationSlug }}
					className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 transition-colors hover:bg-destructive/10"
				>
					<AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
					<div className="min-w-0 flex-1 text-sm">
						<span className="font-medium text-destructive">
							{watcherStats.down} watcher
							{watcherStats.down > 1 ? "s" : ""} down
						</span>
						<span className="ml-2 text-xs text-muted-foreground">
							{watcherStats.up} of {watcherStats.total} up
						</span>
					</div>
					<span className="text-xs text-muted-foreground">
						View →
					</span>
				</Link>
			)}

			{/* Hero metric strip — ordered by operator importance */}
			<MetricStrip columns={8}>
				{isLoading ? (
					Array.from({ length: 8 }).map((_, i) => (
						<MetricCardSkeleton key={i} />
					))
				) : (
					<>
						<MetricCard
							label="Collected"
							value={formatCurrency(billing?.totalCollected ?? 0)}
							icon={BanknoteIcon}
							tone="success"
							hint="This cycle"
							href={`${base}/billing/payments`}
						/>
						<MetricCard
							label="Collection rate"
							value={`${billing?.paidPercentage ?? 0}%`}
							icon={HandCoinsIcon}
							tone="info"
							hint={
								billing
									? `${billing.totalCustomers - billing.unpaidCustomers} of ${billing.totalCustomers}`
									: undefined
							}
						/>
						<MetricCard
							label="Unpaid"
							value={billing?.unpaidCustomers ?? 0}
							icon={DollarSignIcon}
							tone={
								(billing?.unpaidCustomers ?? 0) > 0
									? "warning"
									: "default"
							}
							href={`${base}/billing/collect`}
						/>
						<MetricCard
							label="Online now"
							value={customers?.online ?? 0}
							icon={WifiIcon}
							tone="success"
							hint={`of ${customers?.total ?? 0} total`}
							href={`${base}/customers`}
						/>
						<MetricCard
							label="Offline"
							value={customers?.offline ?? 0}
							icon={WifiOffIcon}
							tone={
								(customers?.offline ?? 0) > 0
									? "default"
									: "default"
							}
						/>
						<MetricCard
							label="Expired"
							value={customers?.expired ?? 0}
							icon={CalendarXIcon}
							tone={
								(customers?.expired ?? 0) > 0
									? "warning"
									: "default"
							}
						/>
						<MetricCard
							label="Stopped"
							value={billing?.stoppedPayments ?? 0}
							icon={OctagonXIcon}
							tone={
								(billing?.stoppedPayments ?? 0) > 0
									? "danger"
									: "default"
							}
							href={`${base}/billing/stopped`}
						/>
						<MetricCard
							label="Open tasks"
							value={
								(taskStats?.open ?? 0) +
								(taskStats?.inProgress ?? 0)
							}
							icon={ClipboardListIcon}
							tone={
								(taskStats?.overdue ?? 0) > 0
									? "warning"
									: "default"
							}
							hint={
								(taskStats?.overdue ?? 0) > 0
									? `${taskStats?.overdue} overdue`
									: undefined
							}
							href={`${base}/tasks`}
						/>
					</>
				)}
			</MetricStrip>

			{/* Charts row — connectivity, customer status, tasks */}
			<div className="grid gap-4 lg:grid-cols-3">
				<DistributionCard
					title="Connectivity"
					subtitle="Online vs offline subscribers"
					data={networkData}
					colorMap={STATUS_COLORS}
					footer={
						customers && customers.online + customers.offline > 0
							? `${Math.round((customers.online / (customers.online + customers.offline)) * 100)}% online`
							: undefined
					}
					isLoading={isLoadingCustomers}
					icon={WifiIcon}
				/>
				<DistributionCard
					title="Customer status"
					subtitle="Active vs other states"
					data={customerStatusData}
					colorMap={STATUS_COLORS}
					isLoading={isLoadingCustomers}
					icon={UserCheckIcon}
				/>
				<DistributionCard
					title="Tasks overview"
					subtitle={
						taskStats?.unassigned
							? `${taskStats.unassigned} unassigned`
							: "By status"
					}
					data={taskStatusData}
					colorMap={TASK_COLORS}
					isLoading={isLoadingTasks}
					icon={ClipboardListIcon}
				/>
			</div>
		</div>
	);
}

function DistributionCard({
	title,
	subtitle,
	data,
	colorMap,
	footer,
	isLoading,
	icon: Icon,
}: {
	title: string;
	subtitle?: string;
	data: { name: string; value: number }[];
	colorMap: Record<string, string>;
	footer?: string;
	isLoading?: boolean;
	icon?: LucideIcon;
}) {
	return (
		<ContentCard>
			<ContentCardSection className="border-b border-border">
				<div className="flex items-center gap-2">
					{Icon && (
						<Icon className="size-3.5 text-muted-foreground" />
					)}
					<div className="text-sm font-medium">{title}</div>
				</div>
				{subtitle && (
					<p className="mt-0.5 text-xs text-muted-foreground">
						{subtitle}
					</p>
				)}
			</ContentCardSection>
			<ContentCardSection>
				{isLoading ? (
					<div className="h-44 animate-pulse rounded bg-muted/40" />
				) : data.length === 0 ? (
					<p className="py-12 text-center text-sm text-muted-foreground">
						No data
					</p>
				) : (
					<StatusPieChart
						title=""
						data={data}
						colorMap={colorMap}
						size="sm"
						footer={footer}
					/>
				)}
			</ContentCardSection>
		</ContentCard>
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
	return { stats: query.data, isLoading: query.isLoading };
}

function useWatcherStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.watchers.getStats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["watchers", "getStats"]),
	);
	return { stats: query.data, isLoading: query.isLoading };
}

function useTaskStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.tasks.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["tasks", "stats"]),
	);
	return { stats: query.data, isLoading: query.isLoading };
}

function useBillingStatsQuery(organizationId: string | null) {
	const query = useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "payments", "stats"]),
	);
	return { stats: query.data, isLoading: query.isLoading };
}

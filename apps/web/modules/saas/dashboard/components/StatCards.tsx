"use client";

import { formatSmartPercent } from "@shared/components/charts/chart-utils";
import { DistributionCard } from "@shared/components/DistributionCard";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
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
	OctagonXIcon,
	UserCheckIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
	Online: "var(--success)",
	Offline: "var(--muted-foreground)",
	Active: "var(--success)",
	Expired: "var(--warning)",
	Inactive: "var(--chart-1)",
	Suspended: "var(--chart-5)",
	Pending: "var(--chart-6)",
};

const TASK_COLORS: Record<string, string> = {
	Open: "var(--info)",
	"In Progress": "var(--chart-6)",
	Completed: "var(--success)",
	Overdue: "var(--destructive)",
	"On Hold": "var(--warning)",
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

	const networkSlices = customers
		? [
				{
					label: "Online",
					value: customers.online,
					color: STATUS_COLORS.Online ?? "var(--success)",
				},
				{
					label: "Offline",
					value: customers.offline,
					color: STATUS_COLORS.Offline ?? "var(--muted-foreground)",
				},
			]
		: [];

	const customerStatusSlices = customers
		? [
				{
					label: "Active",
					value: customers.active,
					color: STATUS_COLORS.Active ?? "var(--success)",
				},
				{
					label: "Expired",
					value: customers.expired,
					color: STATUS_COLORS.Expired ?? "var(--warning)",
				},
				{
					label: "Pending",
					value: customers.pending,
					color: STATUS_COLORS.Pending ?? "var(--chart-6)",
				},
				{
					label: "Suspended",
					value: customers.suspended,
					color: STATUS_COLORS.Suspended ?? "var(--chart-5)",
				},
				{
					label: "Inactive",
					value: customers.inactive,
					color: STATUS_COLORS.Inactive ?? "var(--chart-1)",
				},
			]
		: [];

	const taskSlices = taskStats
		? [
				{
					label: "Open",
					value: taskStats.open,
					color: TASK_COLORS.Open ?? "var(--info)",
				},
				{
					label: "In Progress",
					value: taskStats.inProgress,
					color: TASK_COLORS["In Progress"] ?? "var(--chart-6)",
				},
				{
					label: "Overdue",
					value: taskStats.overdue,
					color: TASK_COLORS.Overdue ?? "var(--destructive)",
				},
				{
					label: "On Hold",
					value: taskStats.onHold,
					color: TASK_COLORS["On Hold"] ?? "var(--warning)",
				},
				{
					label: "Completed",
					value: taskStats.completed,
					color: TASK_COLORS.Completed ?? "var(--success)",
				},
			]
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
							value={
								billing && billing.totalCustomers > 0
									? formatSmartPercent(
											((billing.totalCustomers -
												billing.unpaidCustomers) /
												billing.totalCustomers) *
												100,
										)
									: "0%"
							}
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

			{/* Distribution row — dense stacked bar + ranked legend */}
			<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				<DistributionCard
					title="Connectivity"
					subtitle="subscribers"
					icon={WifiIcon}
					slices={networkSlices}
					footer={
						customers && customers.online + customers.offline > 0
							? `${Math.round((customers.online / (customers.online + customers.offline)) * 100)}% online · refreshed every 30s`
							: undefined
					}
				/>
				<DistributionCard
					title="Customer status"
					subtitle="active / expired / other"
					icon={UserCheckIcon}
					slices={customerStatusSlices}
				/>
				<DistributionCard
					title="Tasks overview"
					subtitle={
						taskStats?.unassigned
							? `${taskStats.unassigned} unassigned`
							: "by status"
					}
					icon={ClipboardListIcon}
					slices={taskSlices}
					footer={
						taskStats?.overdue
							? `${taskStats.overdue} overdue need attention`
							: undefined
					}
				/>
			</div>
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

"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import {
	CollectedVsTarget,
	CollectorLeaderboard,
} from "@shared/components/charts";
import { DistributionCard } from "@shared/components/DistributionCard";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
import { formatCurrency } from "@shared/lib/format";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@ui/components/data-table";
import { cn } from "@ui/lib";
import {
	BanknoteIcon,
	CalculatorIcon,
	HandCoinsIcon,
	OctagonXIcon,
	PercentIcon,
	ReceiptIcon,
	TrendingUpIcon,
	UsersIcon,
} from "lucide-react";
import {
	useAccountingReports,
	useCurrentMonth,
	useMonthFilter,
	usePaymentStats,
} from "../hooks/use-billing";
import { BillingCycleSelect } from "./BillingCycleSelect";

interface CollectorRow {
	collectorId: string;
	name: string;
	paymentCount: number;
	totalCollected: number;
	totalHandedOff: number;
	balance: number;
}

const collectorColumns: ColumnDef<CollectorRow, unknown>[] = [
	{
		accessorKey: "name",
		header: "Collector",
		cell: ({ row }) => (
			<span className="font-medium">{row.original.name}</span>
		),
	},
	{
		accessorKey: "paymentCount",
		header: "Payments",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="block text-right tabular-nums">
				{row.original.paymentCount}
			</span>
		),
	},
	{
		accessorKey: "totalCollected",
		header: "Collected",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="block text-right tabular-nums">
				{formatCurrency(row.original.totalCollected)}
			</span>
		),
	},
	{
		accessorKey: "totalHandedOff",
		header: "Handed Off",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="block text-right tabular-nums">
				{formatCurrency(row.original.totalHandedOff)}
			</span>
		),
	},
	{
		accessorKey: "balance",
		header: "Balance",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span
				className={cn(
					"block text-right font-medium tabular-nums",
					row.original.balance > 0 && "text-warning",
				)}
			>
				{formatCurrency(row.original.balance)}
			</span>
		),
	},
];

export function BillingDashboard() {
	const { data: currentMonthData } = useCurrentMonth();
	const stats = usePaymentStats(currentMonthData?.month?.id);
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		isAll,
		options: monthOptions,
	} = useMonthFilter();
	const scope = isAll ? "all" : "month";
	const { data: reports } = useAccountingReports(scope, activeMonthId);
	const { activeOrganization } = useActiveOrganization();
	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}/billing`
		: "/app";

	const paymentStatusSlices = [
		{
			label: "Collected",
			value: stats.collectedPayments,
			color: "var(--success)",
		},
		{
			label: "Stopped",
			value: stats.stoppedPayments,
			color: "var(--destructive)",
		},
	];

	const collectorEntries = reports.collectorBreakdown
		.map((c) => ({
			collectorId: c.collectorId,
			name: c.name,
			amount: c.totalCollected,
			count: c.paymentCount,
		}))
		.filter((c) => c.amount > 0);

	return (
		<div className="space-y-6">
			{/* Period selector */}
			<div className="flex items-center justify-between gap-3">
				<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					Showing {isAll ? "all time" : "current cycle"}
				</div>
				<BillingCycleSelect
					value={monthFilter || activeMonthId || "all"}
					onValueChange={setMonthFilter}
					options={monthOptions}
					allLabel="All Time"
					className="w-44"
				/>
			</div>

			{/* Hero metric strip — ordered by importance */}
			<MetricStrip columns={6}>
				<MetricCard
					label="Collected"
					value={formatCurrency(stats.totalCollected)}
					icon={BanknoteIcon}
					tone="success"
					hint={`${stats.collectedPayments} payments`}
					href={`${basePath}/payments`}
				/>
				<MetricCard
					label="Collection rate"
					value={`${stats.paidPercentage}%`}
					icon={PercentIcon}
					tone="info"
					hint={`${stats.totalCustomers - stats.unpaidCustomers} of ${stats.totalCustomers}`}
				/>
				<MetricCard
					label="Unpaid"
					value={stats.unpaidCustomers}
					icon={UsersIcon}
					tone={stats.unpaidCustomers > 0 ? "warning" : "default"}
					href={`${basePath}/collect`}
				/>
				<MetricCard
					label="Stopped"
					value={stats.stoppedPayments}
					icon={OctagonXIcon}
					tone={stats.stoppedPayments > 0 ? "danger" : "default"}
					href={`${basePath}/stopped`}
				/>
				<MetricCard
					label="Handed off"
					value={formatCurrency(reports.totalHandedOff)}
					icon={HandCoinsIcon}
					tone="default"
					hint="Cash in office"
				/>
				<MetricCard
					label="Net total"
					value={formatCurrency(reports.grandTotal)}
					icon={TrendingUpIcon}
					tone={reports.grandTotal >= 0 ? "success" : "danger"}
					hint="Handed off − expenses"
				/>
			</MetricStrip>

			{/* Charts row — progress radial + payment status + expense summary */}
			<div className="grid gap-4 lg:grid-cols-3">
				<ContentCard>
					<ContentCardSection className="border-b border-border">
						<div className="text-sm font-medium">
							Collection progress
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							% of customers settled this cycle
						</p>
					</ContentCardSection>
					<ContentCardSection>
						<CollectedVsTarget
							collected={stats.paidPercentage}
							target={100}
							currency="USD"
							height={180}
						/>
						<div className="mt-3 grid grid-cols-2 gap-3">
							<a
								href={`${basePath}/payments`}
								className="rounded-md border border-border px-2 py-1.5 text-center transition-colors hover:bg-accent/40"
							>
								<div className="text-base font-medium tabular-nums text-success">
									{stats.totalCustomers -
										stats.unpaidCustomers}
								</div>
								<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
									Paid
								</div>
							</a>
							<a
								href={`${basePath}/collect`}
								className="rounded-md border border-border px-2 py-1.5 text-center transition-colors hover:bg-accent/40"
							>
								<div
									className={cn(
										"text-base font-medium tabular-nums",
										stats.unpaidCustomers > 0
											? "text-warning"
											: "text-foreground",
									)}
								>
									{stats.unpaidCustomers}
								</div>
								<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
									Remaining
								</div>
							</a>
						</div>
					</ContentCardSection>
				</ContentCard>

				<DistributionCard
					title="Payment status"
					subtitle="payments"
					icon={BanknoteIcon}
					slices={paymentStatusSlices}
				/>

				<ContentCard>
					<ContentCardSection className="border-b border-border">
						<div className="text-sm font-medium">
							Expense summary
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Approved expenses this period
						</p>
					</ContentCardSection>
					<ContentCardSection>
						<div className="space-y-3">
							<div className="flex items-center gap-3">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
									<ReceiptIcon className="size-4" />
								</div>
								<div className="flex-1">
									<div className="text-xl font-medium tabular-nums tracking-tight">
										{formatCurrency(reports.totalExpenses)}
									</div>
									<div className="text-[11px] text-muted-foreground">
										Total expenses
									</div>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
									<CalculatorIcon className="size-4" />
								</div>
								<div className="flex-1">
									<div className="text-xl font-medium tabular-nums tracking-tight text-success">
										{formatCurrency(reports.grandTotal)}
									</div>
									<div className="text-[11px] text-muted-foreground">
										Net (handed off − expenses)
									</div>
								</div>
							</div>
						</div>
					</ContentCardSection>
				</ContentCard>
			</div>

			{/* Collector leaderboard + breakdown */}
			{collectorEntries.length > 0 && (
				<div className="grid gap-4 lg:grid-cols-5">
					<ContentCard className="lg:col-span-2">
						<ContentCardSection className="border-b border-border">
							<div className="text-sm font-medium">
								Collector leaderboard
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Top collectors by collected
							</p>
						</ContentCardSection>
						<ContentCardSection>
							<CollectorLeaderboard
								data={collectorEntries}
								height={280}
							/>
						</ContentCardSection>
					</ContentCard>

					<ContentCard className="lg:col-span-3">
						<ContentCardSection className="border-b border-border">
							<div className="text-sm font-medium">
								Collector breakdown
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Per-collector cash position
							</p>
						</ContentCardSection>
						<DataTable
							columns={collectorColumns}
							data={reports.collectorBreakdown}
							pageSize={10}
							emptyState={
								<p className="py-8 text-center text-sm text-muted-foreground">
									No data for selected period
								</p>
							}
						/>
					</ContentCard>
				</div>
			)}
		</div>
	);
}

export function BillingDashboardSkeleton() {
	return (
		<div className="space-y-6">
			<MetricStrip columns={6}>
				{Array.from({ length: 6 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>
		</div>
	);
}

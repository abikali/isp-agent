"use client";

import { ChartCard } from "@shared/components/ChartCard";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { TOOLTIP_STYLE } from "@shared/components/StatusPieChart";
import { formatCurrency, truncate } from "@shared/lib/format";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	DollarSignIcon,
	ReceiptIcon,
	TrendingUpIcon,
	UsersIcon,
} from "lucide-react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts is the repo-wide charting lib, statically imported by every shared chart component and already in the billing route's vendor chunk; a one-off lazy boundary here yields no bundle win
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useAccountingReports, useMonthFilter } from "../hooks/use-billing";
import { BillingCycleSelect } from "./BillingCycleSelect";

export function AccountingReportsSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<div className="grid gap-4 grid-cols-2 md:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-28" />
				))}
			</div>
			<Skeleton className="h-64" />
		</div>
	);
}

interface CollectorBreakdownRow {
	collectorId: string;
	name: string;
	paymentCount: number;
	totalCollected: number;
	totalHandedOff: number;
	balance: number;
}

const collectorColumns: ColumnDef<CollectorBreakdownRow, unknown>[] = [
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
			<span className="text-right block">
				{row.original.paymentCount}
			</span>
		),
	},
	{
		accessorKey: "totalCollected",
		header: "Total Collected",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="text-right block">
				{formatCurrency(row.original.totalCollected)}
			</span>
		),
	},
	{
		accessorKey: "totalHandedOff",
		header: "Handed Off",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="text-right block">
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
					"text-right block font-medium",
					row.original.balance > 0 &&
						"text-amber-600 dark:text-amber-400",
				)}
			>
				{formatCurrency(row.original.balance)}
			</span>
		),
	},
];

export function AccountingReports() {
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		isAll,
		options: monthOptions,
	} = useMonthFilter();

	const scope = isAll ? "all" : "month";
	const { data } = useAccountingReports(scope, activeMonthId);

	const collectorChartData = data.collectorBreakdown
		.sort((a, b) => b.totalCollected - a.totalCollected)
		.slice(0, 8)
		.map((c) => ({
			name: truncate(c.name, 12),
			fullName: c.name,
			collected: c.totalCollected,
			handedOff: c.totalHandedOff,
			balance: c.balance,
		}));

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Accounting Reports
					</h2>
					<p className="text-muted-foreground">
						Financial summary across collectors and expenses
					</p>
				</div>
				<BillingCycleSelect
					value={monthFilter || activeMonthId || "all"}
					onValueChange={setMonthFilter}
					options={monthOptions}
					allLabel="All Time"
					className="w-full sm:w-44"
				/>
			</div>

			{/* Summary Cards */}
			<StatCardGroup columns={4}>
				<StatCard
					title="Total Collected"
					value={formatCurrency(data.totalCollected)}
					icon={DollarSignIcon}
					color="blue"
					description="From all collectors"
				/>
				<StatCard
					title="Total Handed Off"
					value={formatCurrency(data.totalHandedOff)}
					icon={UsersIcon}
					color="green"
					description="Cash received from collectors"
				/>
				<StatCard
					title="Expenses"
					value={formatCurrency(data.totalExpenses)}
					icon={ReceiptIcon}
					color="red"
					description="Approved expenses"
				/>
				<StatCard
					title="Grand Total"
					value={formatCurrency(data.grandTotal)}
					icon={TrendingUpIcon}
					color="emerald"
					description="Handed off − Expenses"
				/>
			</StatCardGroup>

			{/* Collector Comparison Chart */}
			{collectorChartData.length > 0 && (
				<ChartCard
					title="Collector Comparison"
					description="Collected vs. handed off per collector"
				>
					<div className="h-56">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={collectorChartData}
								margin={{
									left: 0,
									right: 16,
									top: 8,
									bottom: 0,
								}}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									vertical={false}
									stroke="var(--color-border)"
								/>
								<XAxis
									dataKey="name"
									tick={{
										fontSize: 11,
										fill: "var(--color-muted-foreground)",
									}}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tick={{
										fontSize: 11,
										fill: "var(--color-muted-foreground)",
									}}
									axisLine={false}
									tickLine={false}
									tickFormatter={(v: number) => `$${v}`}
								/>
								<Tooltip contentStyle={TOOLTIP_STYLE} />
								<Bar
									dataKey="collected"
									fill="var(--color-chart-2)"
									radius={[4, 4, 0, 0]}
									maxBarSize={32}
									name="collected"
								/>
								<Bar
									dataKey="handedOff"
									fill="var(--color-chart-3)"
									radius={[4, 4, 0, 0]}
									maxBarSize={32}
									name="handedOff"
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
					<div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
						<div className="flex items-center gap-1.5">
							<div
								className="size-2.5 rounded-full"
								style={{
									backgroundColor: "var(--color-chart-2)",
								}}
							/>
							Collected
						</div>
						<div className="flex items-center gap-1.5">
							<div
								className="size-2.5 rounded-full"
								style={{
									backgroundColor: "var(--color-chart-3)",
								}}
							/>
							Handed Off
						</div>
					</div>
				</ChartCard>
			)}

			{/* Collector Breakdown Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Collector Breakdown
					</CardTitle>
				</CardHeader>
				<CardContent>
					<DataTable
						columns={collectorColumns}
						data={data.collectorBreakdown}
						pageSize={10}
						emptyState={
							<p className="text-center text-muted-foreground py-8">
								No data for selected period
							</p>
						}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

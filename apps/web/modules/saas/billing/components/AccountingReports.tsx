"use client";

import { ChartCard } from "@shared/components/ChartCard";
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
			<div className="grid gap-4 grid-cols-2 md:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Total Collected
						</CardTitle>
						<DollarSignIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-xl sm:text-2xl font-bold">
							{formatCurrency(data.totalCollected)}
						</p>
						<p className="text-xs text-muted-foreground">
							From all collectors
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Total Handed Off
						</CardTitle>
						<UsersIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-xl sm:text-2xl font-bold">
							{formatCurrency(data.totalHandedOff)}
						</p>
						<p className="text-xs text-muted-foreground">
							Cash received from collectors
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Expenses
						</CardTitle>
						<ReceiptIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-destructive">
							{formatCurrency(data.totalExpenses)}
						</p>
						<p className="text-xs text-muted-foreground">
							Approved expenses
						</p>
					</CardContent>
				</Card>

				<Card className="border-primary/20 bg-primary/5">
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Grand Total
						</CardTitle>
						<TrendingUpIcon className="h-4 w-4 text-primary" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-primary">
							{formatCurrency(data.grandTotal)}
						</p>
						<p className="text-xs text-muted-foreground">
							Handed off &minus; Expenses
						</p>
					</CardContent>
				</Card>
			</div>

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

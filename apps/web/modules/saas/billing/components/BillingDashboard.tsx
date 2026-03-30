"use client";

import { ChartCard } from "@shared/components/ChartCard";
import {
	StatCard,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import {
	StatusPieChart,
	TOOLTIP_STYLE,
} from "@shared/components/StatusPieChart";
import { formatCurrency, truncate } from "@shared/lib/format";
import { Progress } from "@ui/components/progress";
import { cn } from "@ui/lib";
import {
	DollarSignIcon,
	OctagonXIcon,
	PercentIcon,
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
import { usePaymentStats } from "../hooks/use-billing";

const PAYMENT_COLORS: Record<string, string> = {
	Processed: "var(--color-chart-3)",
	Pending: "var(--color-chart-4)",
	Partial: "var(--color-chart-6)",
	Stopped: "var(--color-destructive)",
};

export function BillingDashboard() {
	const stats = usePaymentStats();

	const paymentStatusData = [
		{ name: "Processed", value: stats.processedPayments },
		{ name: "Pending", value: stats.pendingPayments },
		{ name: "Partial", value: stats.partialPayments },
		{ name: "Stopped", value: stats.stoppedPayments },
	].filter((d) => d.value > 0);

	const collectorData = stats.collectorBreakdown
		.sort((a, b) => b.totalCollected - a.totalCollected)
		.slice(0, 8)
		.map((c) => ({
			name: truncate(c.collectorName, 14),
			fullName: c.collectorName,
			collected: c.totalCollected,
			payments: c.paymentCount,
		}));

	return (
		<div className="space-y-6">
			{/* Key Metrics */}
			<StatCardGroup columns={4}>
				<StatCard
					title="Total Collected"
					value={formatCurrency(stats.totalCollected)}
					icon={DollarSignIcon}
					variant="success"
				/>
				<StatCard
					title="Paid"
					value={`${stats.paidPercentage}%`}
					icon={PercentIcon}
					description={`${stats.totalCustomers - stats.unpaidCustomers} of ${stats.totalCustomers} active customers`}
				/>
				<StatCard
					title="Unpaid"
					value={stats.unpaidCustomers}
					icon={UsersIcon}
					variant={stats.unpaidCustomers > 0 ? "warning" : "default"}
				/>
				<StatCard
					title="Stopped"
					value={stats.stoppedPayments}
					icon={OctagonXIcon}
					variant={
						stats.stoppedPayments > 0 ? "destructive" : "default"
					}
				/>
			</StatCardGroup>

			{/* Charts Row */}
			<div className="grid gap-4 lg:grid-cols-3">
				{/* Collection Progress */}
				<ChartCard title="Collection Progress">
					<div className="space-y-4">
						<div className="flex items-baseline justify-between">
							<span className="text-3xl font-bold tabular-nums">
								{stats.paidPercentage}%
							</span>
							<span className="text-sm text-muted-foreground">
								of customers paid
							</span>
						</div>
						<Progress
							value={stats.paidPercentage}
							className="h-3"
						/>
						<div className="grid grid-cols-2 gap-4 pt-2">
							<div>
								<div className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
									{stats.totalCustomers -
										stats.unpaidCustomers}
								</div>
								<div className="text-xs text-muted-foreground">
									Paid
								</div>
							</div>
							<div>
								<div
									className={cn(
										"text-lg font-semibold tabular-nums",
										stats.unpaidCustomers > 0 &&
											"text-amber-600 dark:text-amber-400",
									)}
								>
									{stats.unpaidCustomers}
								</div>
								<div className="text-xs text-muted-foreground">
									Remaining
								</div>
							</div>
						</div>
					</div>
				</ChartCard>

				{/* Payment Status */}
				{paymentStatusData.length > 0 && (
					<StatusPieChart
						title="Payment Status"
						data={paymentStatusData}
						colorMap={PAYMENT_COLORS}
						footer={`${stats.totalPayments} total payments`}
						size="lg"
					/>
				)}

				{/* Collector Performance */}
				{collectorData.length > 0 && (
					<ChartCard title="Top Collectors">
						<div className="h-48">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={collectorData}
									layout="vertical"
									margin={{
										left: 0,
										right: 16,
										top: 0,
										bottom: 0,
									}}
								>
									<CartesianGrid
										strokeDasharray="3 3"
										horizontal={false}
										stroke="var(--color-border)"
									/>
									<XAxis
										type="number"
										tick={{
											fontSize: 11,
											fill: "var(--color-muted-foreground)",
										}}
										axisLine={false}
										tickLine={false}
										tickFormatter={(v: number) => `$${v}`}
									/>
									<YAxis
										dataKey="name"
										type="category"
										width={100}
										tick={{
											fontSize: 11,
											fill: "var(--color-muted-foreground)",
										}}
										axisLine={false}
										tickLine={false}
									/>
									<Tooltip contentStyle={TOOLTIP_STYLE} />
									<Bar
										dataKey="collected"
										fill="var(--color-chart-3)"
										radius={[0, 4, 4, 0]}
										maxBarSize={20}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
					</ChartCard>
				)}
			</div>
		</div>
	);
}

export function BillingDashboardSkeleton() {
	return (
		<div className="space-y-6">
			<StatCardGroup columns={4}>
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</StatCardGroup>
		</div>
	);
}

"use client";

import { ChartCard } from "@shared/components/ChartCard";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import {
	StatusPieChart,
	TOOLTIP_STYLE,
} from "@shared/components/StatusPieChart";
import { truncate } from "@shared/lib/format";
import {
	CalendarXIcon,
	StickyNoteIcon,
	UserMinusIcon,
	UsersIcon,
	WifiIcon,
	WifiOffIcon,
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
import { useCustomerStats } from "../hooks/use-customers";

const STATUS_COLORS: Record<string, string> = {
	Active: "var(--color-chart-3)",
	Expired: "var(--color-chart-4)",
	Inactive: "var(--color-chart-1)",
	Suspended: "var(--color-chart-5)",
	Pending: "var(--color-chart-6)",
};

interface CustomerStatsProps {
	activeStatus: string;
	onStatusChange: (value: string) => void;
}

export function CustomerStats({
	activeStatus,
	onStatusChange,
}: CustomerStatsProps) {
	const stats = useCustomerStats();

	const statusData = [
		{ name: "Active", value: stats.active },
		{ name: "Expired", value: stats.expired },
		{ name: "Inactive", value: stats.inactive },
		{ name: "Suspended", value: stats.suspended },
		{ name: "Pending", value: stats.pending },
	].filter((d) => d.value > 0);

	const planData =
		stats.planDistribution?.slice(0, 8).map((p) => ({
			name: truncate(p.planName, 15),
			fullName: p.planName,
			subscribers: p.count,
		})) ?? [];

	return (
		<div className="space-y-4">
			<StatCardGroup columns={6}>
				<StatCard
					title="Total"
					value={stats.total}
					icon={UsersIcon}
					color="blue"
					onClick={() => onStatusChange("all")}
					active={activeStatus === "all"}
				/>
				<StatCard
					title="Online"
					value={stats.online}
					icon={WifiIcon}
					color="green"
					onClick={() => onStatusChange("ONLINE")}
					active={activeStatus === "ONLINE"}
				/>
				<StatCard
					title="Offline"
					value={stats.offline}
					icon={WifiOffIcon}
					color="default"
					onClick={() => onStatusChange("OFFLINE")}
					active={activeStatus === "OFFLINE"}
				/>
				<StatCard
					title="Expired"
					value={stats.expired}
					icon={CalendarXIcon}
					color={stats.expired > 0 ? "red" : "default"}
					onClick={() => onStatusChange("EXPIRED")}
					active={activeStatus === "EXPIRED"}
				/>
				<StatCard
					title="Inactive"
					value={stats.inactive}
					icon={UserMinusIcon}
					color={stats.inactive > 0 ? "amber" : "default"}
					onClick={() => onStatusChange("INACTIVE")}
					active={activeStatus === "INACTIVE"}
				/>
				<StatCard
					title="Needs Review"
					value={stats.needsReview}
					icon={StickyNoteIcon}
					color={stats.needsReview > 0 ? "amber" : "default"}
					onClick={() => onStatusChange("NEEDS_REVIEW")}
					active={activeStatus === "NEEDS_REVIEW"}
				/>
			</StatCardGroup>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{/* Status Breakdown */}
				{statusData.length > 0 && (
					<StatusPieChart
						title="Customer Status"
						data={statusData}
						colorMap={STATUS_COLORS}
					/>
				)}

				{/* Plan Distribution */}
				{planData.length > 0 && (
					<ChartCard title="Top Plans" className="lg:col-span-2">
						<div className="h-40 sm:h-48">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={planData}
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
											fontSize: 12,
											fill: "var(--color-muted-foreground)",
										}}
										axisLine={false}
										tickLine={false}
									/>
									<YAxis
										dataKey="name"
										type="category"
										width={70}
										tick={{
											fontSize: 11,
											fill: "var(--color-muted-foreground)",
										}}
										axisLine={false}
										tickLine={false}
									/>
									<Tooltip contentStyle={TOOLTIP_STYLE} />
									<Bar
										dataKey="subscribers"
										fill="var(--color-chart-2)"
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

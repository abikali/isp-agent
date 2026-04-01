"use client";

import { ChartCard } from "@shared/components/ChartCard";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import { Progress } from "@ui/components/progress";
import {
	ClockIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useEmployeeStats } from "../hooks/use-employees";

const STATUS_COLORS: Record<string, string> = {
	Active: "var(--color-chart-3)",
	"On Leave": "var(--color-chart-4)",
	Inactive: "var(--color-chart-1)",
};

const DEPARTMENT_LABELS: Record<string, string> = {
	TECHNICAL: "Technical",
	CUSTOMER_SERVICE: "Customer Service",
	BILLING: "Billing",
	MANAGEMENT: "Management",
	FIELD_OPS: "Field Ops",
};

export function EmployeeStats() {
	const stats = useEmployeeStats();

	const statusData = [
		{ name: "Active", value: stats.active },
		{ name: "On Leave", value: stats.onLeave },
		{ name: "Inactive", value: stats.inactive },
	].filter((d) => d.value > 0);

	const activeRate =
		stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

	const departmentData = (stats.departmentBreakdown ?? []).map((d) => ({
		name: DEPARTMENT_LABELS[d.department ?? ""] ?? d.department ?? "Other",
		value: d.count,
	}));

	const topCollectors = stats.topCollectors ?? [];

	return (
		<div className="space-y-4">
			<StatCardGroup columns={4}>
				<StatCard
					title="Total Employees"
					value={stats.total}
					icon={UsersIcon}
					color="blue"
				/>
				<StatCard
					title="Active"
					value={stats.active}
					icon={UserCheckIcon}
					color="green"
				/>
				<StatCard
					title="On Leave"
					value={stats.onLeave}
					icon={ClockIcon}
					color={stats.onLeave > 0 ? "amber" : "default"}
				/>
				<StatCard
					title="Inactive"
					value={stats.inactive}
					icon={UserMinusIcon}
				/>
			</StatCardGroup>

			{stats.total > 0 && (
				<div className="grid gap-4 lg:grid-cols-3">
					{statusData.length > 1 && (
						<StatusPieChart
							title="Employee Status"
							data={statusData}
							colorMap={STATUS_COLORS}
							footer={`${activeRate}% active rate`}
						/>
					)}

					{departmentData.length > 0 && (
						<ChartCard title="By Department">
							<div className="space-y-3">
								{departmentData.map((d) => {
									const pct =
										stats.active > 0
											? Math.round(
													(d.value / stats.active) *
														100,
												)
											: 0;
									return (
										<div key={d.name}>
											<div className="flex items-center justify-between text-sm mb-1">
												<span>{d.name}</span>
												<span className="text-muted-foreground tabular-nums">
													{d.value}
												</span>
											</div>
											<Progress
												value={pct}
												className="h-1.5"
											/>
										</div>
									);
								})}
							</div>
						</ChartCard>
					)}

					{topCollectors.length > 0 && (
						<ChartCard title="Top Collectors">
							<div className="space-y-3">
								{topCollectors.map((c, i) => (
									<div
										key={c.name}
										className="flex items-center gap-3"
									>
										<span className="text-xs font-medium text-muted-foreground w-4 tabular-nums">
											{i + 1}
										</span>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium truncate">
												{c.name}
											</p>
										</div>
										<span className="text-sm font-semibold tabular-nums">
											{c.customers}
										</span>
										<span className="text-xs text-muted-foreground">
											customers
										</span>
									</div>
								))}
							</div>
						</ChartCard>
					)}
				</div>
			)}
		</div>
	);
}

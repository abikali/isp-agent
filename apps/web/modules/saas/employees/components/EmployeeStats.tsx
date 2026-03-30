"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
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

export function EmployeeStats() {
	const stats = useEmployeeStats();

	const statusData = [
		{ name: "Active", value: stats.active },
		{ name: "On Leave", value: stats.onLeave },
		{ name: "Inactive", value: stats.inactive },
	].filter((d) => d.value > 0);

	const activeRate =
		stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

	return (
		<div className="space-y-4">
			<StatCardGroup columns={4}>
				<StatCard
					title="Total Employees"
					value={stats.total}
					icon={UsersIcon}
				/>
				<StatCard
					title="Active"
					value={stats.active}
					icon={UserCheckIcon}
					variant="success"
				/>
				<StatCard
					title="On Leave"
					value={stats.onLeave}
					icon={ClockIcon}
					variant={stats.onLeave > 0 ? "warning" : "default"}
				/>
				<StatCard
					title="Inactive"
					value={stats.inactive}
					icon={UserMinusIcon}
				/>
			</StatCardGroup>

			{stats.total > 0 && statusData.length > 1 && (
				<StatusPieChart
					title="Employee Status"
					data={statusData}
					colorMap={STATUS_COLORS}
					footer={`${activeRate}% active rate`}
				/>
			)}
		</div>
	);
}

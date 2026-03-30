"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import { UserCheckIcon, UserMinusIcon, UsersIcon } from "lucide-react";
import { useDealerStats } from "../hooks/use-dealers";

const STATUS_COLORS: Record<string, string> = {
	Active: "var(--color-chart-3)",
	Inactive: "var(--color-chart-1)",
};

export function DealerStats() {
	const stats = useDealerStats();

	const statusData = [
		{ name: "Active", value: stats.active },
		{ name: "Inactive", value: stats.inactive },
	].filter((d) => d.value > 0);

	const activeRate =
		stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

	return (
		<div className="space-y-4">
			<StatCardGroup columns={3}>
				<StatCard
					title="Total Dealers"
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
					title="Inactive"
					value={stats.inactive}
					icon={UserMinusIcon}
				/>
			</StatCardGroup>

			{stats.total > 0 && statusData.length > 1 && (
				<StatusPieChart
					title="Dealer Status"
					data={statusData}
					colorMap={STATUS_COLORS}
					footer={`${activeRate}% active rate`}
				/>
			)}
		</div>
	);
}

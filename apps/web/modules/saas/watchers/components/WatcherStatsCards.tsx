"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import {
	ActivityIcon,
	AlertTriangleIcon,
	CheckCircleIcon,
	HelpCircleIcon,
} from "lucide-react";
import { useWatcherStats } from "../hooks/use-executions";

const STATUS_COLORS: Record<string, string> = {
	Up: "var(--color-chart-3)",
	Down: "var(--color-destructive)",
	Unknown: "var(--color-chart-1)",
};

export function WatcherStatsCards() {
	const stats = useWatcherStats();

	const statusData = [
		{ name: "Up", value: stats.up },
		{ name: "Down", value: stats.down },
		{ name: "Unknown", value: stats.unknown },
	].filter((d) => d.value > 0);

	const uptimeRate =
		stats.total > 0 ? Math.round((stats.up / stats.total) * 100) : 0;

	return (
		<div className="space-y-4">
			<StatCardGroup columns={4}>
				<StatCard
					title="Total Watchers"
					value={stats.total}
					icon={ActivityIcon}
					color="blue"
				/>
				<StatCard
					title="Up"
					value={stats.up}
					icon={CheckCircleIcon}
					color="green"
				/>
				<StatCard
					title="Down"
					value={stats.down}
					icon={AlertTriangleIcon}
					color={stats.down > 0 ? "red" : "default"}
				/>
				<StatCard
					title="Unknown"
					value={stats.unknown}
					icon={HelpCircleIcon}
				/>
			</StatCardGroup>

			{stats.total > 0 && statusData.length > 1 && (
				<StatusPieChart
					title="Watcher Status"
					data={statusData}
					colorMap={STATUS_COLORS}
					footer={`${uptimeRate}% healthy`}
				/>
			)}
		</div>
	);
}

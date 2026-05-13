"use client";

import { DistributionCard } from "@shared/components/DistributionCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import {
	ActivityIcon,
	AlertTriangleIcon,
	CheckCircleIcon,
	HelpCircleIcon,
	PercentIcon,
} from "lucide-react";
import { useWatcherStats } from "../hooks/use-executions";

const STATUS_COLORS: Record<string, string> = {
	Up: "var(--success)",
	Down: "var(--destructive)",
	Unknown: "var(--muted-foreground)",
};

export function WatcherStatsCards() {
	const stats = useWatcherStats();

	const statusSlices = [
		{
			label: "Up",
			value: stats.up,
			color: STATUS_COLORS.Up ?? "var(--success)",
		},
		{
			label: "Down",
			value: stats.down,
			color: STATUS_COLORS.Down ?? "var(--destructive)",
		},
		{
			label: "Unknown",
			value: stats.unknown,
			color: STATUS_COLORS.Unknown ?? "var(--muted-foreground)",
		},
	];

	const uptimeRate =
		stats.total > 0 ? Math.round((stats.up / stats.total) * 100) : 0;

	return (
		<div className="space-y-4">
			<MetricStrip columns={5}>
				<MetricCard
					label="Total"
					value={stats.total}
					icon={ActivityIcon}
					tone="info"
				/>
				<MetricCard
					label="Up"
					value={stats.up}
					icon={CheckCircleIcon}
					tone="success"
				/>
				<MetricCard
					label="Down"
					value={stats.down}
					icon={AlertTriangleIcon}
					tone={stats.down > 0 ? "danger" : "default"}
				/>
				<MetricCard
					label="Unknown"
					value={stats.unknown}
					icon={HelpCircleIcon}
					tone={stats.unknown > 0 ? "warning" : "default"}
				/>
				<MetricCard
					label="Uptime"
					value={`${uptimeRate}%`}
					icon={PercentIcon}
					tone={
						uptimeRate >= 95
							? "success"
							: uptimeRate >= 80
								? "warning"
								: "danger"
					}
					hint="Currently healthy"
				/>
			</MetricStrip>

			{stats.total > 0 && (
				<DistributionCard
					title="Watcher status"
					subtitle="watchers"
					icon={ActivityIcon}
					slices={statusSlices}
					footer={`${uptimeRate}% currently healthy`}
				/>
			)}
		</div>
	);
}

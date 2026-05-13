"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import {
	ActivityIcon,
	AlertTriangleIcon,
	CheckCircleIcon,
	HelpCircleIcon,
	PercentIcon,
} from "lucide-react";
import { useWatcherStats } from "../hooks/use-executions";

const STATUS_COLORS: Record<string, string> = {
	Up: "var(--chart-2)",
	Down: "var(--destructive)",
	Unknown: "var(--chart-1)",
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

			{stats.total > 0 && statusData.length > 1 && (
				<ContentCard>
					<ContentCardSection className="border-b border-border">
						<div className="flex items-center gap-2">
							<ActivityIcon className="size-3.5 text-muted-foreground" />
							<div className="text-sm font-medium">
								Status distribution
							</div>
						</div>
					</ContentCardSection>
					<ContentCardSection>
						<StatusPieChart
							title=""
							data={statusData}
							colorMap={STATUS_COLORS}
							size="sm"
							footer={`${uptimeRate}% healthy`}
						/>
					</ContentCardSection>
				</ContentCard>
			)}
		</div>
	);
}

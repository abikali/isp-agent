"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import {
	AlertTriangleIcon,
	CheckCircleIcon,
	ClipboardListIcon,
	ClockIcon,
	PauseIcon,
	PercentIcon,
	UserXIcon,
} from "lucide-react";
import { useTaskStats } from "../hooks/use-tasks";

const STATUS_COLORS: Record<string, string> = {
	Open: "var(--chart-2)",
	"In Progress": "var(--chart-6)",
	"On Hold": "var(--chart-5)",
	Completed: "var(--chart-3)",
	Cancelled: "var(--chart-1)",
};

export function TaskStats({
	sources,
}: {
	sources?: ("MANUAL" | "AI_ESCALATION" | "LEGACY")[];
} = {}) {
	const stats = useTaskStats({ sources });

	const statusData = [
		{ name: "Open", value: stats.open },
		{ name: "In Progress", value: stats.inProgress },
		{ name: "On Hold", value: stats.onHold },
		{ name: "Completed", value: stats.completed },
		{ name: "Cancelled", value: stats.cancelled },
	].filter((d) => d.value > 0);

	const completionRate =
		stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
	const activeCount = stats.open + stats.inProgress;

	return (
		<div className="space-y-4">
			<MetricStrip columns={6}>
				<MetricCard
					label="Active"
					value={activeCount}
					icon={ClockIcon}
					tone={activeCount > 0 ? "info" : "default"}
					hint={`${stats.open} open · ${stats.inProgress} in progress`}
				/>
				<MetricCard
					label="Overdue"
					value={stats.overdue}
					icon={AlertTriangleIcon}
					tone={stats.overdue > 0 ? "danger" : "default"}
				/>
				<MetricCard
					label="Unassigned"
					value={stats.unassigned}
					icon={UserXIcon}
					tone={stats.unassigned > 0 ? "warning" : "default"}
				/>
				<MetricCard
					label="On hold"
					value={stats.onHold}
					icon={PauseIcon}
					tone={stats.onHold > 0 ? "warning" : "default"}
				/>
				<MetricCard
					label="Completed"
					value={stats.completed}
					icon={CheckCircleIcon}
					tone="success"
				/>
				<MetricCard
					label="Completion rate"
					value={`${completionRate}%`}
					icon={PercentIcon}
					tone="info"
					hint={`${stats.total} total`}
				/>
			</MetricStrip>

			{stats.total > 0 && statusData.length > 0 && (
				<ContentCard>
					<ContentCardSection className="border-b border-border">
						<div className="flex items-center gap-2">
							<ClipboardListIcon className="size-3.5 text-muted-foreground" />
							<div className="text-sm font-medium">
								Status breakdown
							</div>
						</div>
					</ContentCardSection>
					<ContentCardSection>
						<StatusPieChart
							title=""
							data={statusData}
							colorMap={STATUS_COLORS}
							size="sm"
						/>
					</ContentCardSection>
				</ContentCard>
			)}
		</div>
	);
}

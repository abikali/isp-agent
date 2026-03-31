"use client";

import { ChartCard } from "@shared/components/ChartCard";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import {
	AlertTriangleIcon,
	CheckCircleIcon,
	ClipboardListIcon,
	ClockIcon,
	UserXIcon,
} from "lucide-react";
import { useTaskStats } from "../hooks/use-tasks";

const STATUS_COLORS: Record<string, string> = {
	Open: "var(--color-chart-2)",
	"In Progress": "var(--color-chart-6)",
	"On Hold": "var(--color-chart-5)",
	Completed: "var(--color-chart-3)",
	Cancelled: "var(--color-chart-1)",
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

	return (
		<div className="space-y-4">
			<StatCardGroup columns={5}>
				<StatCard
					title="Total Tasks"
					value={stats.total}
					icon={ClipboardListIcon}
				/>
				<StatCard
					title="Open"
					value={stats.open + stats.inProgress}
					icon={ClockIcon}
					description={`${stats.open} open, ${stats.inProgress} in progress`}
				/>
				<StatCard
					title="Completed"
					value={stats.completed}
					icon={CheckCircleIcon}
					variant="success"
					description={`${completionRate}% completion rate`}
				/>
				<StatCard
					title="Overdue"
					value={stats.overdue}
					icon={AlertTriangleIcon}
					variant={stats.overdue > 0 ? "destructive" : "default"}
				/>
				<StatCard
					title="Unassigned"
					value={stats.unassigned}
					icon={UserXIcon}
					variant={stats.unassigned > 0 ? "warning" : "default"}
				/>
			</StatCardGroup>

			{stats.total > 0 && (
				<div className="grid gap-4 lg:grid-cols-2">
					{/* Status Distribution */}
					{statusData.length > 0 && (
						<StatusPieChart
							title="Task Status"
							data={statusData}
							colorMap={STATUS_COLORS}
							size="lg"
						/>
					)}

					{/* Quick Summary */}
					<ChartCard title="At a Glance">
						<div className="grid grid-cols-2 gap-4">
							<div className="rounded-lg bg-muted/50 p-3 text-center">
								<div className="text-xl sm:text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
									{completionRate}%
								</div>
								<div className="text-xs text-muted-foreground">
									Completion Rate
								</div>
							</div>
							<div className="rounded-lg bg-muted/50 p-3 text-center">
								<div className="text-xl sm:text-2xl font-bold tabular-nums">
									{stats.open +
										stats.inProgress +
										stats.onHold}
								</div>
								<div className="text-xs text-muted-foreground">
									Active Tasks
								</div>
							</div>
							<div className="rounded-lg bg-muted/50 p-3 text-center">
								<div className="text-xl sm:text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
									{stats.overdue}
								</div>
								<div className="text-xs text-muted-foreground">
									Overdue
								</div>
							</div>
							<div className="rounded-lg bg-muted/50 p-3 text-center">
								<div className="text-xl sm:text-2xl font-bold tabular-nums">
									{stats.onHold}
								</div>
								<div className="text-xs text-muted-foreground">
									On Hold
								</div>
							</div>
						</div>
					</ChartCard>
				</div>
			)}
		</div>
	);
}

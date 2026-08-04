"use client";

import { DistributionCard } from "@shared/components/DistributionCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import {
	AlertTriangleIcon,
	BadgeCheckIcon,
	CheckCircleIcon,
	ClipboardListIcon,
	ClockIcon,
	PauseIcon,
	PercentIcon,
	UserXIcon,
} from "lucide-react";
import { useTaskStats } from "../hooks/use-tasks";

const STATUS_COLORS: Record<string, string> = {
	Open: "var(--info)",
	"In Progress": "var(--chart-6)",
	"On Hold": "var(--warning)",
	"Pending Approval": "#a855f7",
	Completed: "var(--success)",
	Cancelled: "var(--muted-foreground)",
};

export function TaskStats({
	sources,
}: {
	sources?: ("MANUAL" | "AI_ESCALATION" | "LEGACY")[];
} = {}) {
	const stats = useTaskStats({ sources });

	const statusSlices = [
		{
			label: "Open",
			value: stats.open,
			color: STATUS_COLORS.Open ?? "var(--info)",
		},
		{
			label: "In Progress",
			value: stats.inProgress,
			color: STATUS_COLORS["In Progress"] ?? "var(--chart-6)",
		},
		{
			label: "On Hold",
			value: stats.onHold,
			color: STATUS_COLORS["On Hold"] ?? "var(--warning)",
		},
		{
			label: "Pending Approval",
			value: stats.pendingApproval,
			color: STATUS_COLORS["Pending Approval"] ?? "#a855f7",
		},
		{
			label: "Completed",
			value: stats.completed,
			color: STATUS_COLORS.Completed ?? "var(--success)",
		},
		{
			label: "Cancelled",
			value: stats.cancelled,
			color: STATUS_COLORS.Cancelled ?? "var(--muted-foreground)",
		},
	];

	const completionRate =
		stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
	const activeCount = stats.open + stats.inProgress;

	return (
		<div className="space-y-4">
			<MetricStrip columns={7}>
				<MetricCard
					label="Active"
					value={activeCount}
					icon={ClockIcon}
					tone={activeCount > 0 ? "info" : "default"}
					hint={`${stats.open} open · ${stats.inProgress} in progress`}
				/>
				<MetricCard
					label="To approve"
					value={stats.pendingApproval}
					icon={BadgeCheckIcon}
					tone={stats.pendingApproval > 0 ? "warning" : "default"}
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

			{stats.total > 0 && (
				<DistributionCard
					title="Status breakdown"
					subtitle="tasks"
					icon={ClipboardListIcon}
					slices={statusSlices}
				/>
			)}
		</div>
	);
}

"use client";

import { DistributionCard } from "@shared/components/DistributionCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import {
	AlertTriangleIcon,
	BadgeCheckIcon,
	CheckCircleIcon,
	ClipboardListIcon,
	ClockIcon,
	PercentIcon,
	UndoIcon,
	UserXIcon,
} from "lucide-react";
import { useTaskStats } from "../hooks/use-tasks";

const STATUS_COLORS: Record<string, string> = {
	Open: "var(--info)",
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

	return (
		<div className="space-y-4">
			<MetricStrip columns={7}>
				<MetricCard
					label="Open"
					value={stats.open}
					icon={ClockIcon}
					tone={stats.open > 0 ? "info" : "default"}
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
					label="Returned"
					value={stats.returned}
					icon={UndoIcon}
					tone={stats.returned > 0 ? "warning" : "default"}
					hint="completions sent back"
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

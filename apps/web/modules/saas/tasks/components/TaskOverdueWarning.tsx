"use client";

import { formatDate, MEDIUM_DATE_FORMAT } from "@shared/lib/format";
import { AlertTriangleIcon } from "lucide-react";

interface TaskOverdueWarningProps {
	dueDate: Date | string | null;
	label?: "task" | "escalation";
}

export function TaskOverdueWarning({
	dueDate,
	label = "task",
}: TaskOverdueWarningProps) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
			<AlertTriangleIcon className="size-4 shrink-0" />
			<span>
				This {label} is overdue — was due{" "}
				{dueDate ? formatDate(dueDate, MEDIUM_DATE_FORMAT) : ""}
			</span>
		</div>
	);
}

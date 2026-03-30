export const TASK_STATUS_LABELS: Record<string, string> = {
	OPEN: "Open",
	IN_PROGRESS: "In Progress",
	ON_HOLD: "On Hold",
	COMPLETED: "Completed",
	CANCELLED: "Cancelled",
};

export const TASK_STATUS_OPTIONS = [
	{ value: "OPEN", label: "Open" },
	{ value: "IN_PROGRESS", label: "In Progress" },
	{ value: "ON_HOLD", label: "On Hold" },
	{ value: "COMPLETED", label: "Completed" },
	{ value: "CANCELLED", label: "Cancelled" },
] as const;

export const TASK_STATUS_COLORS: Record<string, string> = {
	OPEN: "bg-blue-500",
	IN_PROGRESS: "bg-amber-500",
	ON_HOLD: "bg-orange-500",
	COMPLETED: "bg-emerald-500",
	CANCELLED: "bg-gray-400",
};

export const TASK_STATUS_TEXT_COLORS: Record<string, string> = {
	OPEN: "text-blue-700 dark:text-blue-400",
	IN_PROGRESS: "text-amber-700 dark:text-amber-400",
	ON_HOLD: "text-orange-700 dark:text-orange-400",
	COMPLETED: "text-emerald-700 dark:text-emerald-400",
	CANCELLED: "text-gray-500 dark:text-gray-400",
};

export const TASK_STATUS_BG_COLORS: Record<string, string> = {
	OPEN: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
	IN_PROGRESS:
		"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
	ON_HOLD:
		"bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
	COMPLETED:
		"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
	CANCELLED:
		"bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
	LOW: "Low",
	MEDIUM: "Medium",
	HIGH: "High",
	URGENT: "Urgent",
};

export const TASK_PRIORITY_OPTIONS = [
	{ value: "LOW", label: "Low" },
	{ value: "MEDIUM", label: "Medium" },
	{ value: "HIGH", label: "High" },
	{ value: "URGENT", label: "Urgent" },
] as const;

export const TASK_PRIORITY_COLORS: Record<string, string> = {
	LOW: "bg-slate-400",
	MEDIUM: "bg-blue-500",
	HIGH: "bg-orange-500",
	URGENT: "bg-red-500",
};

export const TASK_PRIORITY_BG_COLORS: Record<string, string> = {
	LOW: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700",
	MEDIUM: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
	HIGH: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
	URGENT: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

export const TASK_CATEGORY_LABELS: Record<string, string> = {
	INSTALLATION: "Installation",
	MAINTENANCE: "Maintenance",
	REPAIR: "Repair",
	SUPPORT: "Support",
	BILLING: "Billing",
	GENERAL: "General",
};

export const TASK_CATEGORY_OPTIONS = [
	{ value: "INSTALLATION", label: "Installation" },
	{ value: "MAINTENANCE", label: "Maintenance" },
	{ value: "REPAIR", label: "Repair" },
	{ value: "SUPPORT", label: "Support" },
	{ value: "BILLING", label: "Billing" },
	{ value: "GENERAL", label: "General" },
] as const;

export const TASK_CATEGORY_ICONS: Record<string, string> = {
	INSTALLATION: "Cable",
	MAINTENANCE: "Wrench",
	REPAIR: "Hammer",
	SUPPORT: "Headphones",
	BILLING: "Receipt",
	GENERAL: "FileText",
};

export const TASK_SOURCE_LABELS: Record<string, string> = {
	MANUAL: "Manual",
	AI_ESCALATION: "AI Escalation",
	LEGACY: "Legacy",
};

export const TASK_SOURCE_OPTIONS = [
	{ value: "MANUAL", label: "Manual" },
	{ value: "AI_ESCALATION", label: "AI Escalation" },
	{ value: "LEGACY", label: "Legacy" },
] as const;

export const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
	pending: "Pending",
	contacted: "Contacted",
	promised: "Promised",
	resolved: "Resolved",
	escalated: "Escalated",
};

export const FOLLOW_UP_STATUS_COLORS: Record<string, string> = {
	pending:
		"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
	contacted:
		"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
	promised:
		"bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
	resolved:
		"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
	escalated:
		"bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

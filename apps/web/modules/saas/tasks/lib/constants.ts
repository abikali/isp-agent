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

export const TASK_PRIORITY_BG_COLORS: Record<string, string> = {
	LOW: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700",
	MEDIUM: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
	HIGH: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
	URGENT: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

import {
	CircleDashedIcon,
	HammerIcon,
	HeadsetIcon,
	type LucideIcon,
	PackageMinusIcon,
	PlugZapIcon,
	ReceiptIcon,
	RepeatIcon,
	WrenchIcon,
} from "lucide-react";

export const TASK_CATEGORY_LABELS: Record<string, string> = {
	INSTALLATION: "Installation",
	MAINTENANCE: "Maintenance",
	REPLACEMENT: "Replacement",
	REPAIR: "Repair",
	SUPPORT: "Support",
	BILLING: "Billing",
	GENERAL: "General",
	UNINSTALL: "Uninstall",
};

/** Icon per category — makes the task type scannable at a glance. */
export const TASK_CATEGORY_ICONS: Record<string, LucideIcon> = {
	INSTALLATION: PlugZapIcon,
	REPLACEMENT: RepeatIcon,
	UNINSTALL: PackageMinusIcon,
	MAINTENANCE: WrenchIcon,
	REPAIR: HammerIcon,
	SUPPORT: HeadsetIcon,
	BILLING: ReceiptIcon,
	GENERAL: CircleDashedIcon,
};

/** Colored chip styles per category (same palette convention as status/priority). */
export const TASK_CATEGORY_BG_COLORS: Record<string, string> = {
	INSTALLATION:
		"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
	REPLACEMENT:
		"bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
	UNINSTALL:
		"bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
	MAINTENANCE:
		"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
	REPAIR: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
	SUPPORT:
		"bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
	BILLING:
		"bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
	GENERAL:
		"bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700",
};

export const TASK_CATEGORY_OPTIONS = [
	{ value: "INSTALLATION", label: "Installation" },
	{ value: "MAINTENANCE", label: "Maintenance" },
	{ value: "REPLACEMENT", label: "Replacement" },
	{ value: "REPAIR", label: "Repair" },
	{ value: "SUPPORT", label: "Support" },
	{ value: "BILLING", label: "Billing" },
	{ value: "GENERAL", label: "General" },
	{ value: "UNINSTALL", label: "Uninstall" },
] as const;

export type TaskCategoryValue = (typeof TASK_CATEGORY_OPTIONS)[number]["value"];

/**
 * Per-category metadata used to make the task category dropdown self-explanatory.
 * `completion` describes what the field worker is asked to do when they close the
 * task; `requiresTarget` means the worker is blocked at completion unless the task
 * targets a customer or base (so we block creation without one too).
 */
export const TASK_CATEGORY_META: Record<
	TaskCategoryValue,
	{
		label: string;
		/** One-line meaning, shown under the dropdown when selected. */
		summary: string;
		/** What the worker does to complete this task. */
		completion: string;
		/** Must target a customer or base to be completable. */
		requiresTarget: boolean;
	}
> = {
	INSTALLATION: {
		label: "Installation",
		summary: "New service or equipment setup for a customer or base.",
		completion: "Worker records the installed equipment and a photo.",
		requiresTarget: true,
	},
	REPLACEMENT: {
		label: "Replacement",
		summary: "Swap out equipment in the field.",
		completion:
			"Worker records the new equipment, a photo, and the old equipment recovered.",
		requiresTarget: true,
	},
	UNINSTALL: {
		label: "Uninstall",
		summary: "Remove service and reclaim equipment.",
		completion: "Worker records the recovered equipment.",
		requiresTarget: true,
	},
	MAINTENANCE: {
		label: "Maintenance",
		summary: "Service or check-up visit.",
		completion:
			"Worker logs what they found; equipment used can be recorded but isn't required.",
		requiresTarget: false,
	},
	REPAIR: {
		label: "Repair",
		summary: "Fix a reported fault.",
		completion:
			"Worker logs what they found; equipment used can be recorded but isn't required.",
		requiresTarget: false,
	},
	SUPPORT: {
		label: "Support",
		summary: "General customer support visit or call.",
		completion: "Worker logs the outcome.",
		requiresTarget: false,
	},
	BILLING: {
		label: "Billing",
		summary: "Billing or collection follow-up.",
		completion: "Worker logs the outcome.",
		requiresTarget: false,
	},
	GENERAL: {
		label: "General",
		summary: "Any task that doesn't fit the other categories.",
		completion: "Worker logs the outcome.",
		requiresTarget: false,
	},
};

export const TASK_SOURCE_LABELS: Record<string, string> = {
	MANUAL: "Manual",
	AI_ESCALATION: "AI Escalation",
	LEGACY: "Legacy",
};

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

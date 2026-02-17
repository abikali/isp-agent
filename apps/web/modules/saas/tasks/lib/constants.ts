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

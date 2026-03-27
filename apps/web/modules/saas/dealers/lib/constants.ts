export const DEALER_STATUS_LABELS: Record<string, string> = {
	ACTIVE: "Active",
	INACTIVE: "Inactive",
	SUSPENDED: "Suspended",
	PENDING: "Pending",
};

export const DEALER_STATUS_OPTIONS = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "SUSPENDED", label: "Suspended" },
	{ value: "PENDING", label: "Pending" },
] as const;

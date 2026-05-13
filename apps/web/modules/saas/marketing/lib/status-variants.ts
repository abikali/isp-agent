type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const BROADCAST_STATUS_VARIANTS: Record<string, BadgeVariant> = {
	pending: "outline",
	running: "default",
	completed: "secondary",
	failed: "destructive",
	cancelled: "outline",
};

export const RECIPIENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
	queued: "outline",
	sent: "secondary",
	failed: "destructive",
};

export const AUDIENCE_LABELS: Record<string, string> = {
	isp_customers: "ISP Customers",
	salti_group: "Salti Group",
	csv: "CSV upload",
	manual: "Manual list",
};

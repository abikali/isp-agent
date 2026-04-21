export const CUSTOMER_LIST_STATUSES = [
	"ACTIVE",
	"INACTIVE",
	"SUSPENDED",
	"PENDING",
	"EXPIRED",
	"ONLINE",
	"OFFLINE",
	"NEEDS_REVIEW",
] as const;

export type CustomerListStatus = (typeof CUSTOMER_LIST_STATUSES)[number];

export const CUSTOMER_EXPORT_STATUSES = [
	"ACTIVE",
	"INACTIVE",
	"SUSPENDED",
	"PENDING",
	"EXPIRED",
	"ONLINE",
	"OFFLINE",
] as const;

export type CustomerExportStatus = (typeof CUSTOMER_EXPORT_STATUSES)[number];

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
	ACTIVE: "Active",
	INACTIVE: "Inactive",
	SUSPENDED: "Suspended",
	PENDING: "Pending",
	EXPIRED: "Expired",
};

export const CUSTOMER_STATUS_OPTIONS = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "SUSPENDED", label: "Suspended" },
	{ value: "PENDING", label: "Pending" },
	{ value: "EXPIRED", label: "Expired" },
] as const;

export const CONNECTION_TYPE_LABELS: Record<string, string> = {
	FIBER: "Fiber",
	WIRELESS: "Wireless",
	DSL: "DSL",
	CABLE: "Cable",
	ETHERNET: "Ethernet",
};

export const CONNECTION_TYPE_OPTIONS = [
	{ value: "FIBER", label: "Fiber" },
	{ value: "WIRELESS", label: "Wireless" },
	{ value: "DSL", label: "DSL" },
	{ value: "CABLE", label: "Cable" },
	{ value: "ETHERNET", label: "Ethernet" },
] as const;

export const STATION_STATUS_LABELS: Record<string, string> = {
	ACTIVE: "Active",
	MAINTENANCE: "Maintenance",
	OFFLINE: "Offline",
};

export const STATION_STATUS_OPTIONS = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "MAINTENANCE", label: "Maintenance" },
	{ value: "OFFLINE", label: "Offline" },
] as const;

export const CSV_HEADERS = [
	"First Name",
	"Last Name",
	"Email",
	"Mobile",
	"Phone",
	"Address",
	"Username",
	"Plan",
	"Station",
	"Connection Type",
	"IP Address",
	"MAC Address",
	"Monthly Rate",
	"Billing Day",
	"Notes",
] as const;

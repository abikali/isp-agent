export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
	ACTIVE: "Active",
	INACTIVE: "Inactive",
	SUSPENDED: "Suspended",
	PENDING: "Pending",
};

export const CUSTOMER_STATUS_OPTIONS = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "SUSPENDED", label: "Suspended" },
	{ value: "PENDING", label: "Pending" },
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

export const CSV_HEADERS = [
	"Full Name",
	"Email",
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

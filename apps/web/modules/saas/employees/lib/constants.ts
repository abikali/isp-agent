export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
	ACTIVE: "Active",
	INACTIVE: "Inactive",
	ON_LEAVE: "On Leave",
};

export const EMPLOYEE_STATUS_OPTIONS = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "ON_LEAVE", label: "On Leave" },
] as const;

export const EMPLOYEE_DEPARTMENT_LABELS: Record<string, string> = {
	TECHNICAL: "Technical",
	CUSTOMER_SERVICE: "Customer Service",
	BILLING: "Billing",
	MANAGEMENT: "Management",
	FIELD_OPS: "Field Operations",
};

export const EMPLOYEE_DEPARTMENT_OPTIONS = [
	{ value: "TECHNICAL", label: "Technical" },
	{ value: "CUSTOMER_SERVICE", label: "Customer Service" },
	{ value: "BILLING", label: "Billing" },
	{ value: "MANAGEMENT", label: "Management" },
	{ value: "FIELD_OPS", label: "Field Operations" },
] as const;

export const EMPLOYEE_CSV_HEADERS = [
	"Name",
	"Email",
	"Phone",
	"Position",
	"Department",
	"Hire Date",
	"Station",
	"Notes",
] as const;

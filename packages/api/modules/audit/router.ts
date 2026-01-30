import { listAdminAuditLogs } from "./procedures/list-admin-audit-logs";
import { listOrganizationAuditLogs } from "./procedures/list-organization-audit-logs";

export const auditRouter = {
	organization: {
		list: listOrganizationAuditLogs,
	},
	admin: {
		list: listAdminAuditLogs,
	},
};

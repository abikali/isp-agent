import { assignStations } from "./procedures/assign-stations";
import { bulkExportEmployees } from "./procedures/bulk-export";
import { bulkImportEmployees } from "./procedures/bulk-import";
import { connectTelegram } from "./procedures/connect-telegram";
import { createEmployee } from "./procedures/create";
import { deleteEmployee } from "./procedures/delete";
import { getEmployee } from "./procedures/get";
import { inviteEmployee } from "./procedures/invite";
import { listEmployees } from "./procedures/list";
import { getMyEmployeeIdentity } from "./procedures/me";
import { getMyCustomerItems } from "./procedures/my-customer-items";
import { getMyWorkerStats } from "./procedures/my-stats";
import { getMyWorkerTrend } from "./procedures/my-trend";
import { getEmployeeReport } from "./procedures/report";
import { getEmployeeStats } from "./procedures/stats";
import { testTelegram } from "./procedures/test-telegram";
import { updateEmployee } from "./procedures/update";

export const employeesRouter = {
	list: listEmployees,
	get: getEmployee,
	create: createEmployee,
	update: updateEmployee,
	delete: deleteEmployee,
	connectTelegram: connectTelegram,
	testTelegram: testTelegram,
	assignStations: assignStations,
	stats: getEmployeeStats,
	report: getEmployeeReport,
	bulkImport: bulkImportEmployees,
	bulkExport: bulkExportEmployees,
	invite: inviteEmployee,
	me: getMyEmployeeIdentity,
	myStats: getMyWorkerStats,
	myTrend: getMyWorkerTrend,
	myCustomerItems: getMyCustomerItems,
};

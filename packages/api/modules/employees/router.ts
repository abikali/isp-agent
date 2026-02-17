import { assignStations } from "./procedures/assign-stations";
import { bulkExportEmployees } from "./procedures/bulk-export";
import { bulkImportEmployees } from "./procedures/bulk-import";
import { createEmployee } from "./procedures/create";
import { deleteEmployee } from "./procedures/delete";
import { getEmployee } from "./procedures/get";
import { listEmployees } from "./procedures/list";
import { getEmployeeStats } from "./procedures/stats";
import { updateEmployee } from "./procedures/update";

export const employeesRouter = {
	list: listEmployees,
	get: getEmployee,
	create: createEmployee,
	update: updateEmployee,
	delete: deleteEmployee,
	assignStations: assignStations,
	stats: getEmployeeStats,
	bulkImport: bulkImportEmployees,
	bulkExport: bulkExportEmployees,
};

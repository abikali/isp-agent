import { bulkExportCustomers } from "./procedures/bulk-export";
import { bulkImportCustomers } from "./procedures/bulk-import";
import { createCustomer } from "./procedures/create";
import { deleteCustomer } from "./procedures/delete";
import { generateCustomerPin } from "./procedures/generate-pin";
import { getCustomer } from "./procedures/get";
import { listCustomers } from "./procedures/list";
import { listCustomerInvoices } from "./procedures/list-invoices";
import { listCustomerTransactions } from "./procedures/list-transactions";
import { resetCustomerPin } from "./procedures/reset-pin";
import { setCustomerPin } from "./procedures/set-pin";
import { getCustomerStats } from "./procedures/stats";
import {
	bulkResolveSyncConflicts,
	getSyncConflictsSummary,
	listSyncConflicts,
	resolveSyncConflict,
} from "./procedures/sync-conflicts";
import {
	cancelIRadiusSync,
	getIRadiusSyncStatus,
	syncFromIRadius,
	testIRadius,
} from "./procedures/sync-iradius";
import { updateCustomer } from "./procedures/update";

export const customersRouter = {
	list: listCustomers,
	get: getCustomer,
	create: createCustomer,
	update: updateCustomer,
	delete: deleteCustomer,
	stats: getCustomerStats,
	bulkImport: bulkImportCustomers,
	bulkExport: bulkExportCustomers,
	setPin: setCustomerPin,
	resetPin: resetCustomerPin,
	generatePin: generateCustomerPin,
	listTransactions: listCustomerTransactions,
	listInvoices: listCustomerInvoices,
	testIRadius,
	syncFromIRadius,
	cancelIRadiusSync,
	getIRadiusSyncStatus,
	listSyncConflicts,
	resolveSyncConflict,
	bulkResolveSyncConflicts,
	getSyncConflictsSummary,
};

// Side-effect import: registers the customer status change observer that
// dispatches iRadius active/inactive sync whenever customer.status transitions
// via the extended `db` client. Must be imported before any procedure runs.
import "./lib/customer-status-observer";
import { bulkExportCustomers } from "./procedures/bulk-export";
import { bulkImportCustomers } from "./procedures/bulk-import";
import {
	executeAccountTypeChangeProcedure,
	previewAccountTypeChangeProcedure,
} from "./procedures/change-account-type";
import { createCustomer } from "./procedures/create";
import { deleteCustomer } from "./procedures/delete";
import { generateCustomerPin } from "./procedures/generate-pin";
import { getCustomer } from "./procedures/get";
import {
	resetCustomerMacAddress,
	setCustomerIptvPrice,
	setCustomerRecurringDiscount,
	updateCustomerNameInIRadius,
} from "./procedures/iradius-admin-actions";
import { listCustomers } from "./procedures/list";
import { listCustomerInvoices } from "./procedures/list-invoices";
import { listCustomerTransactions } from "./procedures/list-transactions";
import {
	createLocationRequest,
	getLocationRequestByToken,
	submitLocationByToken,
} from "./procedures/location-request";
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
import {
	applyIRadiusEntitySync,
	previewIRadiusEntitySync,
} from "./procedures/sync-iradius-entities";
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
	previewIRadiusEntitySync,
	applyIRadiusEntitySync,
	previewAccountTypeChange: previewAccountTypeChangeProcedure,
	executeAccountTypeChange: executeAccountTypeChangeProcedure,
	resetMacAddress: resetCustomerMacAddress,
	updateNameInIRadius: updateCustomerNameInIRadius,
	setDiscount: setCustomerRecurringDiscount,
	setIptvPrice: setCustomerIptvPrice,
	createLocationRequest,
	submitLocationByToken,
	getLocationRequestByToken,
};

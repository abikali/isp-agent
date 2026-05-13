import { bulkExportCustomers } from "./procedures/bulk-export";
import { bulkImportCustomers } from "./procedures/bulk-import";
import {
	executeAccountTypeChangeProcedure,
	previewAccountTypeChangeProcedure,
} from "./procedures/change-account-type";
import { getConnectivityStatus } from "./procedures/connectivity-status";
import { createCustomer } from "./procedures/create";
import { deleteCustomer } from "./procedures/delete";
import { generateCustomerPin } from "./procedures/generate-pin";
import { getCustomer } from "./procedures/get";
import {
	resetCustomerMacAddress,
	setCustomerExpiryDate,
	setCustomerIptvPrice,
	setCustomerRecurringDiscount,
	updateCustomerNameInIRadius,
} from "./procedures/iradius-admin-actions";
import { listCustomers } from "./procedures/list";
import { listCustomerInvoices } from "./procedures/list-invoices";
import { listIRadiusGroups } from "./procedures/list-iradius-groups";
import { listCustomerTransactions } from "./procedures/list-transactions";
import {
	bulkRequestLocation,
	clearCustomerLocation,
	createLocationRequest,
	getLocationRequestByToken,
	submitLocationByToken,
	updateCustomerLocation,
} from "./procedures/location-request";
import {
	cancelIRadiusPush,
	getIRadiusPushStatus,
	pushCustomerToIRadius,
	startIRadiusPush,
} from "./procedures/push-to-iradius";
import { resetCustomerPin } from "./procedures/reset-pin";
import { searchCustomersForPicker } from "./procedures/search-for-picker";
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
	importCustomerFromIRadius,
	previewIRadiusEntitySync,
} from "./procedures/sync-iradius-entities";
import { updateCustomer } from "./procedures/update";

export const customersRouter = {
	list: listCustomers,
	listIRadiusGroups,
	searchForPicker: searchCustomersForPicker,
	get: getCustomer,
	create: createCustomer,
	update: updateCustomer,
	delete: deleteCustomer,
	stats: getCustomerStats,
	connectivityStatus: getConnectivityStatus,
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
	importFromIRadius: importCustomerFromIRadius,
	pushToIRadius: pushCustomerToIRadius,
	startIRadiusPush,
	cancelIRadiusPush,
	getIRadiusPushStatus,
	previewAccountTypeChange: previewAccountTypeChangeProcedure,
	executeAccountTypeChange: executeAccountTypeChangeProcedure,
	resetMacAddress: resetCustomerMacAddress,
	updateNameInIRadius: updateCustomerNameInIRadius,
	setDiscount: setCustomerRecurringDiscount,
	setIptvPrice: setCustomerIptvPrice,
	setExpiryDate: setCustomerExpiryDate,
	createLocationRequest,
	bulkRequestLocation,
	updateCustomerLocation,
	clearCustomerLocation,
	submitLocationByToken,
	getLocationRequestByToken,
};

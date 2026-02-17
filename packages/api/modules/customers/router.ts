import { bulkExportCustomers } from "./procedures/bulk-export";
import { bulkImportCustomers } from "./procedures/bulk-import";
import { createCustomer } from "./procedures/create";
import { deleteCustomer } from "./procedures/delete";
import { generateCustomerPin } from "./procedures/generate-pin";
import { getCustomer } from "./procedures/get";
import { listCustomers } from "./procedures/list";
import { resetCustomerPin } from "./procedures/reset-pin";
import { setCustomerPin } from "./procedures/set-pin";
import { getCustomerStats } from "./procedures/stats";
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
};

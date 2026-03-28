import { closeCycle } from "./procedures/close-cycle";
import { getCollectorBalance } from "./procedures/collector-balance";
import { getCollectorStats } from "./procedures/collector-stats";
import { createCollection } from "./procedures/create-collection";
import { createPayment } from "./procedures/create-payment";
import { getCurrentCycle } from "./procedures/current-cycle";
import { deleteCollection } from "./procedures/delete-collection";
import { deletePayment } from "./procedures/delete-payment";
import { listCollections } from "./procedures/list-collections";
import { listCollectors } from "./procedures/list-collectors";
import { listCycles } from "./procedures/list-cycles";
import { listCustomerGroups } from "./procedures/list-groups";
import { listPayments } from "./procedures/list-payments";
import { listUnpaidCustomers } from "./procedures/list-unpaid";
import { getPaymentStats } from "./procedures/payment-stats";
import {
	bulkProcessPayments,
	processPayment,
} from "./procedures/process-payment";
import { getAccountingReports } from "./procedures/reports";
import { requestLocation } from "./procedures/request-location";
import { listStoppedAccounts, reactivateAccount } from "./procedures/stopped";
import {
	getBillingSyncStatus,
	previewBillingSync,
	syncFromBilling,
	testBilling,
} from "./procedures/sync-billing";

export const billingRouter = {
	cycles: {
		current: getCurrentCycle,
		list: listCycles,
		close: closeCycle,
	},
	payments: {
		list: listPayments,
		create: createPayment,
		process: processPayment,
		bulkProcess: bulkProcessPayments,
		stats: getPaymentStats,
		delete: deletePayment,
	},
	unpaid: {
		list: listUnpaidCustomers,
	},
	groups: {
		list: listCustomerGroups,
	},
	stopped: {
		list: listStoppedAccounts,
		reactivate: reactivateAccount,
	},
	collectors: {
		list: listCollectors,
		balance: getCollectorBalance,
		stats: getCollectorStats,
	},
	collections: {
		list: listCollections,
		create: createCollection,
		delete: deleteCollection,
	},
	location: {
		request: requestLocation,
	},
	reports: getAccountingReports,
	sync: {
		test: testBilling,
		preview: previewBillingSync,
		start: syncFromBilling,
		status: getBillingSyncStatus,
	},
};

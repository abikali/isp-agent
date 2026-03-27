import { closeCycle } from "./procedures/close-cycle";
import { createPayment } from "./procedures/create-payment";
import { getCurrentCycle } from "./procedures/current-cycle";
import { listCycles } from "./procedures/list-cycles";
import { listPayments } from "./procedures/list-payments";
import { listUnpaidCustomers } from "./procedures/list-unpaid";
import { getPaymentStats } from "./procedures/payment-stats";
import {
	bulkProcessPayments,
	processPayment,
} from "./procedures/process-payment";
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
	},
	unpaid: {
		list: listUnpaidCustomers,
	},
	stopped: {
		list: listStoppedAccounts,
		reactivate: reactivateAccount,
	},
	sync: {
		test: testBilling,
		preview: previewBillingSync,
		start: syncFromBilling,
		status: getBillingSyncStatus,
	},
};

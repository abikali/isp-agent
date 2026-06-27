import { getCollectorBalance } from "./procedures/collector-balance";
import { getCollectorLedger } from "./procedures/collector-ledger";
import { getCollectorStats } from "./procedures/collector-stats";
import { createCollection } from "./procedures/create-collection";
import { createInvoice } from "./procedures/create-invoice";
import { createLocationRequest } from "./procedures/create-location-request";
import { createPayment } from "./procedures/create-payment";
import { getCurrentMonth } from "./procedures/current-month";
import { deleteCollection } from "./procedures/delete-collection";
import { deleteInvoice } from "./procedures/delete-invoice";
import { deletePayment } from "./procedures/delete-payment";
import { getInvoice } from "./procedures/get-invoice";
import { getInvoiceDetail } from "./procedures/get-invoice-detail";
import { listAllInvoices } from "./procedures/list-all-invoices";
import { listCollections } from "./procedures/list-collections";
import { listCollectors } from "./procedures/list-collectors";
import { listCustomerGroups } from "./procedures/list-groups";
import { listMonths } from "./procedures/list-months";
import { listPayments } from "./procedures/list-payments";
import { listUnpaidCustomers } from "./procedures/list-unpaid";
import { markReceiptSent } from "./procedures/mark-receipt-sent";
import {
	createNoteCategory,
	deleteNoteCategory,
	listNoteCategories,
	updateNoteCategory,
} from "./procedures/note-categories";
import { notifyLocationNeeded } from "./procedures/notify-location-needed";
import { getPaymentStats } from "./procedures/payment-stats";
import { regenerateMonthInvoices } from "./procedures/regenerate-invoices";
import { getAccountingReports } from "./procedures/reports";
import { requestLocation } from "./procedures/request-location";
import { resendReceipt } from "./procedures/resend-receipt";
import { resetMonth } from "./procedures/reset-month";
import { reviewPayment } from "./procedures/review-payment";
import { reviewPayments } from "./procedures/review-payments";
import {
	declineStoppedPayment,
	listPendingStoppedPayments,
	listStoppedAccounts,
	reactivateAccount,
} from "./procedures/stopped";
import {
	getBillingSyncStatus,
	previewBillingSync,
	syncFromBilling,
	testBilling,
} from "./procedures/sync-billing";
import { toggleMonthLock } from "./procedures/toggle-month-lock";
import { updateInvoice } from "./procedures/update-invoice";
import { updatePayment } from "./procedures/update-payment";
import {
	unvoidInvoiceProcedure,
	voidInvoiceProcedure,
	voidManyInvoicesProcedure,
	voidUnpaidForCustomersProcedure,
} from "./procedures/void-invoice";
import { getMyWallet } from "./procedures/worker-wallet";

export const billingRouter = {
	months: {
		current: getCurrentMonth,
		list: listMonths,
		toggleLock: toggleMonthLock,
		regenerateInvoices: regenerateMonthInvoices,
		reset: resetMonth,
	},
	payments: {
		list: listPayments,
		create: createPayment,
		update: updatePayment,
		delete: deletePayment,
		review: reviewPayment,
		reviewMany: reviewPayments,
		resendReceipt: resendReceipt,
		markReceiptSent: markReceiptSent,
		reactivate: reactivateAccount,
		stats: getPaymentStats,
	},
	invoices: {
		list: listAllInvoices,
		get: getInvoiceDetail,
		create: createInvoice,
		update: updateInvoice,
		delete: deleteInvoice,
		void: voidInvoiceProcedure,
		voidMany: voidManyInvoicesProcedure,
		voidUnpaidForCustomers: voidUnpaidForCustomersProcedure,
		unvoid: unvoidInvoiceProcedure,
	},
	unpaid: {
		list: listUnpaidCustomers,
	},
	groups: {
		list: listCustomerGroups,
	},
	stopped: {
		list: listStoppedAccounts,
		pending: listPendingStoppedPayments,
		decline: declineStoppedPayment,
	},
	collectors: {
		list: listCollectors,
		balance: getCollectorBalance,
		ledger: getCollectorLedger,
		stats: getCollectorStats,
	},
	collections: {
		list: listCollections,
		create: createCollection,
		delete: deleteCollection,
	},
	location: {
		request: requestLocation,
		notifyNeeded: notifyLocationNeeded,
		createRequest: createLocationRequest,
	},
	noteCategories: {
		list: listNoteCategories,
		create: createNoteCategory,
		update: updateNoteCategory,
		delete: deleteNoteCategory,
	},
	invoice: getInvoice,
	myWallet: getMyWallet,
	reports: getAccountingReports,
	// @deprecated — Remove after final PHP billing migration
	sync: {
		test: testBilling,
		preview: previewBillingSync,
		start: syncFromBilling,
		status: getBillingSyncStatus,
	},
};

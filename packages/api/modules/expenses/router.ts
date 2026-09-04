import { getSpendingBucket, setExpenseBucket } from "./procedures/bucket";
import { createExpense } from "./procedures/create";
import { createReceiptUploadUrl } from "./procedures/create-receipt-upload-url";
import { getExpenseFilterOptions } from "./procedures/filter-options";
import { listExpenses } from "./procedures/list";
import { getSpendingOverview } from "./procedures/overview";
import { paySalary } from "./procedures/pay-salary";
import { recordExpense } from "./procedures/record";
import {
	createRecurringExpense,
	deleteRecurringExpense,
	updateRecurringExpense,
} from "./procedures/recurring";
import { approveExpense, rejectExpense } from "./procedures/review";
import { getExpenseStats } from "./procedures/stats";
import { getExpenseSummary } from "./procedures/summary";

export const expensesRouter = {
	list: listExpenses,
	summary: getExpenseSummary,
	filterOptions: getExpenseFilterOptions,
	overview: getSpendingOverview,
	bucket: getSpendingBucket,
	setBucket: setExpenseBucket,
	create: createExpense,
	record: recordExpense,
	createReceiptUploadUrl,
	approve: approveExpense,
	reject: rejectExpense,
	paySalary,
	stats: getExpenseStats,
	recurring: {
		create: createRecurringExpense,
		update: updateRecurringExpense,
		delete: deleteRecurringExpense,
	},
};

import { createExpense } from "./procedures/create";
import { createReceiptUploadUrl } from "./procedures/create-receipt-upload-url";
import { getExpenseFilterOptions } from "./procedures/filter-options";
import { listExpenses } from "./procedures/list";
import { paySalary } from "./procedures/pay-salary";
import { approveExpense, rejectExpense } from "./procedures/review";
import { getExpenseStats } from "./procedures/stats";
import { getExpenseSummary } from "./procedures/summary";

export const expensesRouter = {
	list: listExpenses,
	summary: getExpenseSummary,
	filterOptions: getExpenseFilterOptions,
	create: createExpense,
	createReceiptUploadUrl,
	approve: approveExpense,
	reject: rejectExpense,
	paySalary,
	stats: getExpenseStats,
};

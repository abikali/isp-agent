import { createExpense } from "./procedures/create";
import { createReceiptUploadUrl } from "./procedures/create-receipt-upload-url";
import { listExpenses } from "./procedures/list";
import { approveExpense, rejectExpense } from "./procedures/review";
import { getExpenseStats } from "./procedures/stats";

export const expensesRouter = {
	list: listExpenses,
	create: createExpense,
	createReceiptUploadUrl,
	approve: approveExpense,
	reject: rejectExpense,
	stats: getExpenseStats,
};

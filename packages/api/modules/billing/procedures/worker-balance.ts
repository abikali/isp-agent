import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumAmountOrZero, sumOrZero } from "../lib/calculations";
import { SETTLED_PAYMENT } from "../lib/filters";
import { fetchWorkerBalance } from "../lib/queries";
import {
	getMonthDateRange,
	resolveActiveBillingMonth,
} from "../lib/resolve-month";

export const getWorkerBalance = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/workers/balance",
		tags: ["Billing"],
		summary:
			"Calculate net cash balance for a worker (collected - handed off)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			workerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const activeMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);
		const monthRange = getMonthDateRange(
			activeMonth.year,
			activeMonth.month,
		);
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const [balanceData, monthPaymentsAgg, customerCount, salaryAgg] =
			await Promise.all([
				fetchWorkerBalance(input.organizationId, input.workerId),
				// Amount collected this billing month, attributed to the worker.
				db.payment.aggregate({
					where: {
						organizationId: input.organizationId,
						workerId: input.workerId,
						billingMonthId: activeMonth.id,
						status: "COLLECTED",
						...SETTLED_PAYMENT,
					},
					_sum: { paidAmount: true },
					_count: true,
				}),
				db.customer.count({
					where: {
						organizationId: input.organizationId,
						workerId: input.workerId,
						...dealerFilter,
					},
				}),
				// Salary paid this month (approved salary expenses).
				db.expense.aggregate({
					where: {
						organizationId: input.organizationId,
						submittedById: input.workerId,
						category: "salary",
						status: "APPROVED",
						createdAt: { gte: monthRange.gte, lte: monthRange.lte },
					},
					_sum: { amount: true },
				}),
			]);

		return {
			totalCollected: balanceData.totalCollected,
			totalHandedOff: balanceData.totalHandedOff,
			balance: balanceData.balance,
			customerCount,
			monthPaidCount: monthPaymentsAgg._count,
			monthAmountCollected: sumOrZero(monthPaymentsAgg),
			salaryPaidThisMonth: sumAmountOrZero(salaryAgg),
		};
	});

import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { customerMonthlyDue, sumOrZero } from "../lib/calculations";
import { SETTLED_PAYMENT } from "../lib/filters";
import {
	customersDueThisMonthWhere,
	fetchCollectorBalance,
	fetchRelevantBillingMonths,
} from "../lib/queries";
import {
	getMonthDateRange,
	resolveActiveBillingMonth,
} from "../lib/resolve-month";

export const getCollectorBalance = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors/balance",
		tags: ["Billing"],
		summary:
			"Calculate net balance for a collector (collected - handed off)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string(),
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
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const [balanceData, monthCustomers, monthPaymentsAgg] =
			await Promise.all([
				fetchCollectorBalance(input.organizationId, input.collectorId),
				// Customers due this month: expiry falls in month range OR already paid
				fetchRelevantBillingMonths(
					input.organizationId,
					activeMonth.year,
					activeMonth.month,
				).then((relevantMonths) =>
					db.customer.findMany({
						where: customersDueThisMonthWhere(
							input.organizationId,
							activeMonth.id,
							monthRange,
							{
								collectorId: input.collectorId,
								dealerFilter,
								relevantMonths,
							},
						),
						select: {
							monthlyRate: true,
							iptvPrice: true,
							realIpPrice: true,
							discount: true,
							plan: { select: { monthlyPrice: true } },
						},
					}),
				),
				// Amount collected this month by this collector
				db.payment.aggregate({
					where: {
						organizationId: input.organizationId,
						collectorId: input.collectorId,
						billingMonthId: activeMonth.id,
						status: "COLLECTED",
						...SETTLED_PAYMENT,
						...dealerViaCustomer,
					},
					_sum: { paidAmount: true },
					_count: true,
				}),
			]);

		const monthBillCount = monthCustomers.length;
		const monthAmountDue = monthCustomers.reduce(
			(sum, c) => sum + customerMonthlyDue(c),
			0,
		);
		const monthPaidCount = monthPaymentsAgg._count;
		const monthAmountCollected = sumOrZero(monthPaymentsAgg);

		return {
			totalCollected: balanceData.totalCollected,
			totalHandedOff: balanceData.totalHandedOff,
			balance: balanceData.balance,
			monthBillCount,
			monthAmountDue,
			monthPaidCount,
			monthAmountCollected,
		};
	});

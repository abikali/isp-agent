import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { customerMonthlyDue } from "../lib/calculations";
import {
	countsAsCollected,
	loadCountPolicies,
} from "../lib/collector-count-policy";
import { SETTLED_PAYMENT } from "../lib/filters";
import {
	customersDueThisMonthWhere,
	fetchCollectorBalance,
	fetchMonthSettlementStats,
	fetchRelevantBillingMonths,
	settlementStatsCustomerWhere,
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

		const [
			balanceData,
			monthCustomers,
			monthPaymentsAgg,
			settlementRows,
			policyFor,
		] = await Promise.all([
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
			// Amount collected this month for customers *currently* assigned
			// to this collector. Scoped via `customer.collectorId` so the
			// numerator stays aligned with `monthCustomers` (the denominator
			// — also keyed off `Customer.collectorId`) when admin reassigns.
			// Grouped by customer: with partial payments a month can carry
			// several rows, and "bills collected" should count customers,
			// not rows.
			db.payment.groupBy({
				by: ["customerId"],
				where: {
					organizationId: input.organizationId,
					customer: {
						collectorId: input.collectorId,
						dealerId: activeDealerId ?? null,
					},
					billingMonthId: activeMonth.id,
					status: "COLLECTED",
					...SETTLED_PAYMENT,
				},
				_sum: { paidAmount: true },
			}),
			// Bills collected: amount-aware (a partial month is not paid),
			// free / stopped per the collector's count policy.
			fetchRelevantBillingMonths(
				input.organizationId,
				activeMonth.year,
				activeMonth.month,
			).then((relevantMonths) =>
				fetchMonthSettlementStats({
					organizationId: input.organizationId,
					relevantMonths,
					activeMonthId: activeMonth.id,
					customerWhere: settlementStatsCustomerWhere({
						relevantMonthIds: relevantMonths.map((m) => m.id),
						dealerFilter,
						collectorId: input.collectorId,
					}),
				}),
			),
			loadCountPolicies(input.organizationId),
		]);

		const monthBillCount = monthCustomers.length;
		const monthAmountDue = monthCustomers.reduce(
			(sum, c) => sum + customerMonthlyDue(c),
			0,
		);
		const policy = policyFor(input.collectorId);
		const monthPaidCount = settlementRows.filter((r) =>
			countsAsCollected(r, policy),
		).length;
		const monthAmountCollected = monthPaymentsAgg.reduce(
			(sum, g) => sum + (g._sum.paidAmount ?? 0),
			0,
		);

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

import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	collectorBalance,
	sumAmountOrZero,
	sumOrZero,
} from "../lib/calculations";
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
		await requirePermission(
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

		// Balance is about physical cash — not dealer-scoped
		const [paymentsAgg, collectionsAgg, monthCustomers, monthPaymentsAgg] =
			await Promise.all([
				db.payment.aggregate({
					where: {
						organizationId: input.organizationId,
						collectorId: input.collectorId,
						status: "COLLECTED",
						workerId: null,
					},
					_sum: { paidAmount: true },
				}),
				db.cashCollection.aggregate({
					where: {
						organizationId: input.organizationId,
						collectorId: input.collectorId,
					},
					_sum: { amount: true },
				}),
				// Customers due this month: expiry falls in month range OR already paid
				db.customer.findMany({
					where: {
						organizationId: input.organizationId,
						collectorId: input.collectorId,
						status: "ACTIVE",
						OR: [
							{ groupName: null },
							{
								NOT: {
									groupName: {
										equals: "free",
										mode: "insensitive",
									},
								},
							},
						],
						AND: {
							OR: [
								{ expiresAt: monthRange },
								{
									payments: {
										some: {
											billingMonthId: activeMonth.id,
											status: "COLLECTED",
										},
									},
								},
							],
						},
					},
					select: {
						monthlyRate: true,
						iptvPrice: true,
						realIpPrice: true,
						discount: true,
						plan: { select: { monthlyPrice: true } },
					},
				}),
				// Amount collected this month by this collector
				db.payment.aggregate({
					where: {
						organizationId: input.organizationId,
						collectorId: input.collectorId,
						billingMonthId: activeMonth.id,
						status: "COLLECTED",
					},
					_sum: { paidAmount: true },
					_count: true,
				}),
			]);

		const totalCollected = sumOrZero(paymentsAgg);
		const totalHandedOff = sumAmountOrZero(collectionsAgg);
		const balance = collectorBalance(totalCollected, totalHandedOff);

		const monthBillCount = monthCustomers.length;
		const monthAmountDue = monthCustomers.reduce((sum, c) => {
			const base = c.monthlyRate ?? c.plan?.monthlyPrice ?? 0;
			return (
				sum +
				base +
				(c.iptvPrice ?? 0) +
				(c.realIpPrice ?? 0) -
				(c.discount ?? 0)
			);
		}, 0);
		const monthPaidCount = monthPaymentsAgg._count;
		const monthAmountCollected = sumOrZero(monthPaymentsAgg);

		return {
			totalCollected,
			totalHandedOff,
			balance,
			monthBillCount,
			monthAmountDue,
			monthPaidCount,
			monthAmountCollected,
		};
	});

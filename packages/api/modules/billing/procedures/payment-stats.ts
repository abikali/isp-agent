import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";
import { EXCLUDE_STOPPED } from "../lib/filters";
import {
	applyCollectorScope,
	countPaidCustomers,
	resolveCollectorNames,
	unpaidCustomersWhere,
} from "../lib/queries";
import { getMonthDateRange, resolveYearMonth } from "../lib/resolve-month";
import { monthSpecSchema } from "../lib/schemas";

export const getPaymentStats = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/payments/stats",
		tags: ["Billing"],
		summary: "Get payment statistics for a billing month",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				billingMonthId: z.string().optional(),
			})
			.merge(monthSpecSchema),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const {
			year,
			month,
			billingMonthId: resolvedMonthId,
		} = await resolveYearMonth(
			input.organizationId,
			input.year,
			input.month,
		);
		const monthRange = getMonthDateRange(year, month);

		const monthId = input.billingMonthId ?? resolvedMonthId;

		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const baseWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			...(monthId ? { billingMonthId: monthId } : {}),
			...dealerViaCustomer,
		};

		await applyCollectorScope(baseWhere, permCtx);

		const collectedWhere = { ...baseWhere, ...EXCLUDE_STOPPED };

		const [
			collectedPayments,
			stoppedPayments,
			totalCollected,
			byCollector,
			paidCustomers,
			unpaidCustomers,
			unreviewedCount,
		] = await Promise.all([
			db.payment.count({
				where: collectedWhere,
			}),
			db.payment.count({
				where: { ...baseWhere, stoppedAccount: true },
			}),
			db.payment.aggregate({
				where: collectedWhere,
				_sum: { paidAmount: true },
			}),
			db.payment.groupBy({
				by: ["collectorId"],
				where: collectedWhere,
				_sum: { paidAmount: true },
				_count: true,
			}),
			// Paid customers: distinct customers with a non-stopped payment this month
			monthId
				? countPaidCustomers(input.organizationId, monthId, {
						...EXCLUDE_STOPPED,
						...dealerViaCustomer,
					})
				: Promise.resolve(0),
			// Unpaid customers: includes past-due (expiresAt <= month end, no payment)
			monthId
				? db.customer.count({
						where: unpaidCustomersWhere(
							input.organizationId,
							monthId,
							monthRange,
							{ dealerFilter },
						),
					})
				: Promise.resolve(0),
			// Flagged payments awaiting admin review
			db.payment.count({
				where: {
					organizationId: input.organizationId,
					...(monthId ? { billingMonthId: monthId } : {}),
					...dealerViaCustomer,
					reviewedAt: null,
					OR: [
						{ freeAccount: true },
						{ stoppedAccount: true },
						{ noteCategory: { not: null } },
					],
				},
			}),
		]);

		// Stopped customers: distinct customers with a stoppedAccount payment this month
		const stoppedCustomers = monthId
			? await db.payment
					.findMany({
						where: {
							organizationId: input.organizationId,
							billingMonthId: monthId,
							stoppedAccount: true,
							...dealerViaCustomer,
						},
						select: { customerId: true },
						distinct: ["customerId"],
					})
					.then((ids) => ids.length)
			: 0;

		// Total = paid + stopped + still unpaid
		const totalCustomers =
			paidCustomers + stoppedCustomers + unpaidCustomers;

		// Resolve collector names
		const collectorIds = byCollector.map((c) => c.collectorId);
		const collectorMap = await resolveCollectorNames(collectorIds);

		const collectorBreakdown = byCollector.map((c) => ({
			collectorId: c.collectorId,
			collectorName: collectorMap.get(c.collectorId) ?? "Unknown",
			totalCollected: sumOrZero(c),
			paymentCount: c._count,
		}));

		return {
			collectedPayments,
			stoppedPayments,
			unreviewedCount,
			totalCollected: sumOrZero(totalCollected),
			collectorBreakdown,
			paidCustomers,
			unpaidCustomers,
			totalCustomers,
			paidPercentage:
				totalCustomers > 0
					? Math.floor((paidCustomers / totalCustomers) * 100)
					: 0,
		};
	});

import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";
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

		const [
			collectedPayments,
			stoppedPayments,
			totalCollected,
			byCollector,
			paidCustomers,
			unpaidCustomers,
		] = await Promise.all([
			db.payment.count({
				where: { ...baseWhere, status: "COLLECTED" },
			}),
			db.payment.count({
				where: { ...baseWhere, status: "STOPPED" },
			}),
			db.payment.aggregate({
				where: { ...baseWhere, status: "COLLECTED" },
				_sum: { paidAmount: true },
			}),
			db.payment.groupBy({
				by: ["collectorId"],
				where: { ...baseWhere, status: "COLLECTED" },
				_sum: { paidAmount: true },
				_count: true,
			}),
			// Paid customers: distinct customers with a COLLECTED payment this month
			monthId
				? countPaidCustomers(input.organizationId, monthId, {
						...dealerViaCustomer,
					})
				: Promise.resolve(0),
			// Unpaid customers: includes past-due (expiresAt <= month end, no COLLECTED payment)
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
		]);

		// Total = those who paid (expiry already moved) + those still due (expiry in month)
		const totalCustomers = paidCustomers + unpaidCustomers;

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

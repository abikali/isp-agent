import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";
import { EXCLUDE_STOPPED, PENDING_STOPPED_PAYMENT } from "../lib/filters";
import {
	countDistinctCustomersWithPayments,
	countPaidCustomers,
	fetchRelevantBillingMonths,
	resolveCollectorNames,
	unpaidCustomersWhere,
} from "../lib/queries";
import { getMonthDateRange, resolveYearMonth } from "../lib/resolve-month";
import { countUnreviewedPayments } from "../lib/review-status";
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

		// Resolve own-scope collector once and apply it two ways:
		//  - Payment-side queries (`baseWhere.collectorId`): "payments I handled."
		//  - Customer-side queries (`customer.collectorId`): "my currently-assigned
		//    customers' status." Performance metrics use the customer scope so
		//    they reattribute when admin reassigns mid-cycle.
		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		const ownCollectorId = scope === "own" ? employeeId : null;

		return cachedStat(
			statCacheKey("billing/payment-stats", [
				input.organizationId,
				activeDealerId,
				ownCollectorId,
				monthId,
				year,
				month,
			]),
			async () => {
				const baseWhere: Record<string, unknown> = {
					organizationId: input.organizationId,
					...(monthId ? { billingMonthId: monthId } : {}),
					...dealerViaCustomer,
				};
				if (ownCollectorId) {
					baseWhere["collectorId"] = ownCollectorId;
				}

				const customerScopeViaCustomer: Record<string, unknown> =
					ownCollectorId
						? {
								customer: {
									dealerId: activeDealerId ?? null,
									collectorId: ownCollectorId,
								},
							}
						: dealerViaCustomer;

				const collectedWhere = { ...baseWhere, ...EXCLUDE_STOPPED };

				const [
					collectedPayments,
					stoppedPayments,
					pendingStoppedPayments,
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
					db.payment.count({
						where: { ...baseWhere, ...PENDING_STOPPED_PAYMENT },
					}),
					db.payment.aggregate({
						where: collectedWhere,
						_sum: { paidAmount: true },
					}),
					// Per-collector cash breakdown: stays on `Payment.collectorId` since
					// this answers "how much money each collector physically brought in,"
					// not "performance on currently-assigned customers."
					db.payment.groupBy({
						by: ["collectorId"],
						where: collectedWhere,
						_sum: { paidAmount: true },
						_count: true,
					}),
					// Paid customers: distinct customers settled for the month
					monthId
						? countPaidCustomers(
								input.organizationId,
								monthId,
								customerScopeViaCustomer,
							)
						: Promise.resolve(0),
					// Unpaid customers: any customer with an unpaid invoice in relevant months
					monthId
						? fetchRelevantBillingMonths(
								input.organizationId,
								year,
								month,
							).then((relevantMonths) =>
								db.customer.count({
									where: unpaidCustomersWhere(
										input.organizationId,
										monthId,
										monthRange,
										{
											dealerFilter,
											relevantMonths,
											...(ownCollectorId
												? {
														collectorId:
															ownCollectorId,
													}
												: {}),
										},
									),
								}),
							)
						: Promise.resolve(0),
					// Flagged payments awaiting admin review (free, stopped, or amount mismatch)
					countUnreviewedPayments({
						organizationId: input.organizationId,
						activeDealerId,
						billingMonthId: monthId,
						extraWhere: dealerViaCustomer,
					}),
				]);

				// Stopped customers: distinct customers with a stoppedAccount payment this month
				const [stoppedCustomers, pendingStoppedCustomers] = monthId
					? await Promise.all([
							countDistinctCustomersWithPayments({
								organizationId: input.organizationId,
								billingMonthId: monthId,
								stoppedAccount: true,
								...customerScopeViaCustomer,
							}),
							countDistinctCustomersWithPayments({
								organizationId: input.organizationId,
								billingMonthId: monthId,
								...PENDING_STOPPED_PAYMENT,
								...customerScopeViaCustomer,
							}),
						])
					: [0, 0];

				// Total = paid + stopped + still unpaid. `unpaidCustomers` already
				// excludes pending-stopped (they're in admin-review limbo), but we
				// add pending-stopped explicitly so the total includes them.
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
					pendingStoppedPayments,
					unreviewedCount,
					totalCollected: sumOrZero(totalCollected),
					collectorBreakdown,
					paidCustomers,
					unpaidCustomers,
					stoppedCustomers,
					pendingStoppedCustomers,
					totalCustomers,
					paidPercentage:
						totalCustomers > 0
							? Math.floor((paidCustomers / totalCustomers) * 100)
							: 0,
				};
			},
		);
	});

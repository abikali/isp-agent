import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";
import { EXCLUDE_STOPPED, PENDING_STOPPED_PAYMENT } from "../lib/filters";
import {
	applyCollectorScope,
	countDistinctCustomersWithPayments,
	countPaidCustomers,
	fetchRelevantBillingMonths,
	resolveCollectorNames,
	unpaidCustomersWhere,
} from "../lib/queries";
import { getMonthDateRange, resolveYearMonth } from "../lib/resolve-month";
import { monthSpecSchema } from "../lib/schemas";

/**
 * Count unreviewed flagged payments: free, stopped, OR amount mismatch.
 * Uses Prisma for free/stopped counts, then a separate query + JS filter
 * for amount mismatches (paidAmount != accountPrice - discount).
 */
async function countUnreviewedPayments(
	organizationId: string,
	monthId: string | undefined,
	dealerViaCustomer: Record<string, unknown>,
): Promise<number> {
	const baseWhere = {
		organizationId,
		...(monthId ? { billingMonthId: monthId } : {}),
		...dealerViaCustomer,
		reviewedAt: null,
	};

	const [flaggedCount, mismatchCandidates] = await Promise.all([
		// Free or stopped
		db.payment.count({
			where: {
				...baseWhere,
				OR: [{ freeAccount: true }, { stoppedAccount: true }],
			},
		}),
		// Potential mismatches: not free, not stopped, unreviewed
		db.payment.findMany({
			where: {
				...baseWhere,
				freeAccount: false,
				stoppedAccount: false,
			},
			select: {
				paidAmount: true,
				accountPrice: true,
				discount: true,
				customer: {
					select: { iptvPrice: true, realIpPrice: true },
				},
			},
		}),
	]);

	const mismatchCount = mismatchCandidates.filter((p) => {
		const expected =
			p.accountPrice +
			(p.customer.iptvPrice ?? 0) +
			(p.customer.realIpPrice ?? 0) -
			p.discount;
		return Math.abs(p.paidAmount - expected) > 0.01;
	}).length;

	return flaggedCount + mismatchCount;
}

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
						dealerViaCustomer,
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
								{ dealerFilter, relevantMonths },
							),
						}),
					)
				: Promise.resolve(0),
			// Flagged payments awaiting admin review (free, stopped, or amount mismatch)
			countUnreviewedPayments(
				input.organizationId,
				monthId,
				dealerViaCustomer,
			),
		]);

		// Stopped customers: distinct customers with a stoppedAccount payment this month
		const [stoppedCustomers, pendingStoppedCustomers] = monthId
			? await Promise.all([
					countDistinctCustomersWithPayments({
						organizationId: input.organizationId,
						billingMonthId: monthId,
						stoppedAccount: true,
						...dealerViaCustomer,
					}),
					countDistinctCustomersWithPayments({
						organizationId: input.organizationId,
						billingMonthId: monthId,
						...PENDING_STOPPED_PAYMENT,
						...dealerViaCustomer,
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
	});

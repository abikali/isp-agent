import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { collectorBalance } from "../lib/calculations";
import {
	customersDueThisMonthWhere,
	fetchCollectorBalanceBatch,
	fetchRelevantBillingMonths,
} from "../lib/queries";
import {
	getMonthDateRange,
	resolveActiveBillingMonth,
} from "../lib/resolve-month";

export const listCollectors = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors",
		tags: ["Billing"],
		summary: "List employees who serve as collectors with balance stats",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const dealerFilter = getDealerScopeFilter(activeDealerId);
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const collectors = await db.employee.findMany({
			where: {
				organizationId: input.organizationId,
				status: "ACTIVE",
				OR: [
					{ ...dealerFilter, department: "BILLING" },
					{ customerCollections: { some: dealerFilter } },
				],
			},
			select: {
				id: true,
				name: true,
				username: true,
				phone: true,
				department: true,
				_count: {
					select: {
						customerCollections: { where: dealerFilter },
					},
				},
			},
			orderBy: { name: "asc" },
		});

		if (collectors.length === 0) {
			return { collectors: [] };
		}

		const collectorIds = collectors.map((c) => c.id);

		// Get active billing month for "this month" stats
		const activeMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);

		const monthRange = getMonthDateRange(
			activeMonth.year,
			activeMonth.month,
		);

		// Two different views of "collected":
		//  - Balance (workerId: null): physical cash the collector personally holds.
		//    When a worker collects on behalf of a collector, the cash is with the
		//    worker, not the collector — so it doesn't count toward the collector's
		//    in-hand balance.
		//  - monthCollected (no workerId filter): all payments attributed to this
		//    collector as a performance/progress metric, regardless of who physically
		//    collected the cash.
		const [
			{ collectedMap, handedOffMap },
			monthPayments,
			monthDueByCollector,
			stoppedByCollector,
		] = await Promise.all([
			// Balance: physical cash only (workerId: null), not dealer-scoped
			fetchCollectorBalanceBatch(input.organizationId, collectorIds),
			// Collected this month: only payments with real money (excludes stopped-no-pay)
			db.payment.groupBy({
				by: ["collectorId"],
				where: {
					organizationId: input.organizationId,
					collectorId: { in: collectorIds },
					billingMonthId: activeMonth.id,
					status: "COLLECTED",
					paidAmount: { gt: 0 },
					...dealerViaCustomer,
				},
				_count: true,
			}),
			// Customers due this month per collector (includes stopped-with-pay)
			fetchRelevantBillingMonths(
				input.organizationId,
				activeMonth.year,
				activeMonth.month,
			).then((relevantMonths) =>
				db.customer.groupBy({
					by: ["collectorId"],
					where: customersDueThisMonthWhere(
						input.organizationId,
						activeMonth.id,
						monthRange,
						{ collectorIds, dealerFilter, relevantMonths },
					),
					_count: true,
				}),
			),
			// Stopped accounts this month per collector (for admin badge)
			db.payment.groupBy({
				by: ["collectorId"],
				where: {
					organizationId: input.organizationId,
					collectorId: { in: collectorIds },
					billingMonthId: activeMonth.id,
					stoppedAccount: true,
					...dealerViaCustomer,
				},
				_count: true,
			}),
		]);

		const monthPaymentsMap = new Map(
			monthPayments.map((c) => [c.collectorId, c._count]),
		);
		const monthDueMap = new Map(
			monthDueByCollector.map((c) => [c.collectorId, c._count]),
		);
		const stoppedMap = new Map(
			stoppedByCollector.map((c) => [c.collectorId, c._count]),
		);

		return {
			collectors: collectors.map((c) => {
				const totalCollected = collectedMap.get(c.id) ?? 0;
				const totalHandedOff = handedOffMap.get(c.id) ?? 0;
				return {
					id: c.id,
					name: c.name,
					username: c.username,
					phone: c.phone,
					department: c.department,
					customerCount: c._count.customerCollections,
					inHand: collectorBalance(totalCollected, totalHandedOff),
					monthCollected: monthPaymentsMap.get(c.id) ?? 0,
					monthTotal: monthDueMap.get(c.id) ?? 0,
					stoppedCount: stoppedMap.get(c.id) ?? 0,
				};
			}),
		};
	});

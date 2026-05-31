import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { collectorBalance } from "../lib/calculations";
import { PENDING_STOPPED_PAYMENT, SETTLED_PAYMENT } from "../lib/filters";
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

		return cachedStat(
			statCacheKey("billing/collectors/list", [
				input.organizationId,
				activeDealerId,
			]),
			async () => {
				const collectors = await db.employee.findMany({
					where: {
						organizationId: input.organizationId,
						status: "ACTIVE",
						// Match employee list — skip soft-deleted collectors.
						deletedAt: null,
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

				// All performance metrics (paid / due / stopped / pending-stopped) are
				// keyed off `Customer.collectorId` — the *live* assignment — so they
				// stay aligned when an admin reassigns a customer mid-cycle. The frozen
				// `Payment.collectorId` is reserved for cash-trail views (in-hand
				// balance, ledger, accounting reports) where the question is "who
				// actually handled the cash," not "whose performance bucket is this in."
				const [
					{ collectedMap, handedOffMap },
					monthPaidByCollector,
					monthDueByCollector,
					stoppedByCollector,
					pendingStoppedByCollector,
				] = await Promise.all([
					// Balance: physical cash only (workerId: null), not dealer-scoped
					fetchCollectorBalanceBatch(
						input.organizationId,
						collectorIds,
					),
					// Collected this month: distinct customers (currently assigned to
					// this collector) with at least one settled payment for the month.
					db.customer.groupBy({
						by: ["collectorId"],
						where: {
							organizationId: input.organizationId,
							collectorId: { in: collectorIds },
							...dealerFilter,
							payments: {
								some: {
									billingMonthId: activeMonth.id,
									status: "COLLECTED",
									...SETTLED_PAYMENT,
								},
							},
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
								{
									collectorId: collectorIds,
									dealerFilter,
									relevantMonths,
								},
							),
							_count: true,
						}),
					),
					// Stopped accounts this month per collector (for admin badge).
					// Includes both approved and pending-review stops.
					db.customer.groupBy({
						by: ["collectorId"],
						where: {
							organizationId: input.organizationId,
							collectorId: { in: collectorIds },
							...dealerFilter,
							payments: {
								some: {
									billingMonthId: activeMonth.id,
									stoppedAccount: true,
								},
							},
						},
						_count: true,
					}),
					// Pending-review stops per collector (admin action required).
					db.customer.groupBy({
						by: ["collectorId"],
						where: {
							organizationId: input.organizationId,
							collectorId: { in: collectorIds },
							...dealerFilter,
							payments: {
								some: {
									billingMonthId: activeMonth.id,
									...PENDING_STOPPED_PAYMENT,
								},
							},
						},
						_count: true,
					}),
				]);

				const toMap = (
					rows: { collectorId: string | null; _count: number }[],
				): Map<string, number> => {
					const map = new Map<string, number>();
					for (const row of rows) {
						if (row.collectorId) {
							map.set(row.collectorId, row._count);
						}
					}
					return map;
				};

				const monthPaymentsMap = toMap(monthPaidByCollector);
				const monthDueMap = toMap(monthDueByCollector);
				const stoppedMap = toMap(stoppedByCollector);
				const pendingStoppedMap = toMap(pendingStoppedByCollector);

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
							inHand: collectorBalance(
								totalCollected,
								totalHandedOff,
							),
							monthCollected: monthPaymentsMap.get(c.id) ?? 0,
							monthTotal: monthDueMap.get(c.id) ?? 0,
							stoppedCount: stoppedMap.get(c.id) ?? 0,
							pendingStoppedCount:
								pendingStoppedMap.get(c.id) ?? 0,
						};
					}),
				};
			},
		);
	});

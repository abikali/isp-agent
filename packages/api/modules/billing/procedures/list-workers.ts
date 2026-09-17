import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	resolveCashRole,
	workerRoleWhere,
} from "../../employees/lib/cash-role";
import { collectorBalance } from "../lib/calculations";
import { BILLING_STAT_CACHE } from "../lib/cash-cache";
import { SETTLED_PAYMENT } from "../lib/filters";
import { fetchWorkerBalanceBatch } from "../lib/queries";
import { resolveActiveBillingMonth } from "../lib/resolve-month";

export const listWorkers = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/workers",
		tags: ["Billing"],
		summary: "List field workers with cash-in-hand balance stats",
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
			statCacheKey(BILLING_STAT_CACHE.workersList, [
				input.organizationId,
				activeDealerId,
			]),
			async () => {
				// A "worker" is an employee whose field role is WORKER/BOTH (or,
				// with no role set, one surfaced to the worker portal), plus
				// anyone carrying worker-assigned customers.
				const workers = await db.employee.findMany({
					where: {
						organizationId: input.organizationId,
						status: "ACTIVE",
						deletedAt: null,
						...dealerFilter,
						OR: [
							workerRoleWhere(input.organizationId),
							{ customerWorkerAssignments: { some: {} } },
						],
					},
					select: {
						id: true,
						name: true,
						username: true,
						phone: true,
						department: true,
						cashRole: true,
						_count: {
							select: {
								customerWorkerAssignments: {
									where: dealerFilter,
								},
							},
						},
					},
					orderBy: { name: "asc" },
				});

				if (workers.length === 0) {
					return { workers: [] };
				}

				const workerIds = workers.map((w) => w.id);

				const activeMonth = await resolveActiveBillingMonth(
					input.organizationId,
				);

				const [{ collectedMap, handedOffMap }, monthCollectedByWorker] =
					await Promise.all([
						// Balance: worker-attributed cash only, not dealer-scoped.
						fetchWorkerBalanceBatch(
							input.organizationId,
							workerIds,
						),
						// Distinct customers with a settled, worker-attributed
						// payment this billing month.
						db.payment
							.groupBy({
								by: ["workerId", "customerId"],
								where: {
									organizationId: input.organizationId,
									workerId: { in: workerIds },
									billingMonthId: activeMonth.id,
									status: "COLLECTED",
									...SETTLED_PAYMENT,
								},
							})
							.then((rows) => {
								const map = new Map<string, number>();
								for (const row of rows) {
									if (row.workerId) {
										map.set(
											row.workerId,
											(map.get(row.workerId) ?? 0) + 1,
										);
									}
								}
								return map;
							}),
					]);

				return {
					workers: workers.map((w) => {
						const totalCollected = collectedMap.get(w.id) ?? 0;
						const totalHandedOff = handedOffMap.get(w.id) ?? 0;
						return {
							id: w.id,
							name: w.name,
							username: w.username,
							phone: w.phone,
							department: w.department,
							cashRole: resolveCashRole(w),
							customerCount: w._count.customerWorkerAssignments,
							inHand: collectorBalance(
								totalCollected,
								totalHandedOff,
							),
							monthCollected:
								monthCollectedByWorker.get(w.id) ?? 0,
						};
					}),
				};
			},
		);
	});

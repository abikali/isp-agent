import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { CUSTOMER_NEEDS_REVIEW_WHERE } from "../lib/needs-review";

export const getCustomerStats = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/stats",
		tags: ["Customers"],
		summary: "Get customer dashboard statistics",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			organizationId,
			user.id,
			"customers",
			"read",
		);

		// Scope stats to own customers for collectors with read:own
		const ownerFilter = await getOwnershipFilterAsync(
			permCtx,
			"customers",
			"read",
		);
		const baseWhere = {
			organizationId,
			// Exclude rows soft-deleted by the iRadius sync cleanup so stats
			// match what the list view shows. See `list.ts` for context.
			deletedAt: null,
			...ownerFilter,
			...getDealerScopeFilter(activeDealerId),
		};

		const [
			statusCounts,
			online,
			offline,
			expired,
			needsReview,
			employeeCount,
			planDistribution,
		] = await Promise.all([
			db.customer.groupBy({
				by: ["status"],
				where: baseWhere,
				_count: true,
			}),
			db.customer.count({
				where: { ...baseWhere, online: true },
			}),
			db.customer.count({
				where: { ...baseWhere, online: false, status: "ACTIVE" },
			}),
			db.customer.count({
				where: {
					...baseWhere,
					expiresAt: { lt: new Date() },
					status: "ACTIVE",
				},
			}),
			db.customer.count({
				where: { ...baseWhere, ...CUSTOMER_NEEDS_REVIEW_WHERE },
			}),
			db.employee.count({
				where: {
					organizationId,
					...getDealerScopeFilter(activeDealerId),
				},
			}),
			db.customer.groupBy({
				by: ["planId"],
				where: {
					...baseWhere,
					status: "ACTIVE",
					planId: { not: null },
				},
				_count: true,
				orderBy: { _count: { planId: "desc" } },
				take: 20,
			}),
		]);

		const countByStatus = new Map(
			statusCounts.map((s) => [s.status, s._count]),
		);
		const total = statusCounts.reduce((sum, s) => sum + s._count, 0);
		const active = countByStatus.get("ACTIVE") ?? 0;
		const inactive = countByStatus.get("INACTIVE") ?? 0;
		const suspended = countByStatus.get("SUSPENDED") ?? 0;
		const pending = countByStatus.get("PENDING") ?? 0;

		// Resolve plan names + calculate revenue in parallel
		const planIds = planDistribution
			.map((p) => p.planId)
			.filter((id): id is string => id !== null);

		const [plans, rateRevenue, planRevenue] = await Promise.all([
			planIds.length > 0
				? db.servicePlan.findMany({
						where: { id: { in: planIds } },
						select: { id: true, name: true },
					})
				: [],
			db.customer.aggregate({
				where: {
					...baseWhere,
					status: "ACTIVE",
					monthlyRate: { not: null },
				},
				_sum: { monthlyRate: true },
			}),
			// Scoped users have dynamic ownership filters that can't be safely embedded in raw SQL
			ownerFilter
				? Promise.resolve([{ total: 0 }] as [{ total: number | null }])
				: activeDealerId
					? db.$queryRaw<[{ total: number | null }]>`
						SELECT COALESCE(SUM(sp."monthlyPrice"), 0) as total
						FROM "customer" c
						INNER JOIN "service_plan" sp ON sp."id" = c."planId"
						WHERE c."organizationId" = ${organizationId}
						AND c."status" = 'ACTIVE'
						AND c."monthlyRate" IS NULL
						AND c."dealerId" = ${activeDealerId}
					`
					: db.$queryRaw<[{ total: number | null }]>`
						SELECT COALESCE(SUM(sp."monthlyPrice"), 0) as total
						FROM "customer" c
						INNER JOIN "service_plan" sp ON sp."id" = c."planId"
						WHERE c."organizationId" = ${organizationId}
						AND c."status" = 'ACTIVE'
						AND c."monthlyRate" IS NULL
						AND c."dealerId" IS NULL
					`,
		]);

		const planNameMap = new Map(plans.map((p) => [p.id, p.name]));
		const totalMonthlyRevenue =
			(rateRevenue._sum.monthlyRate ?? 0) +
			Number(planRevenue[0]?.total ?? 0);

		return {
			total,
			active,
			inactive,
			suspended,
			pending,
			online,
			offline,
			expired,
			needsReview,
			employeeCount,
			totalMonthlyRevenue,
			planDistribution: planDistribution.map((p) => ({
				planName: p.planId
					? (planNameMap.get(p.planId) ?? "Unknown")
					: "No Plan",
				count: p._count,
			})),
		};
	});

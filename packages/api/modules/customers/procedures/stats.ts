import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		await requirePermission(organizationId, user.id, "customers", "read");

		const [
			statusCounts,
			online,
			offline,
			expired,
			dealerCount,
			employeeCount,
			planDistribution,
			topDealers,
		] = await Promise.all([
			db.customer.groupBy({
				by: ["status"],
				where: { organizationId },
				_count: true,
			}),
			db.customer.count({
				where: { organizationId, online: true },
			}),
			db.customer.count({
				where: { organizationId, online: false, status: "ACTIVE" },
			}),
			db.customer.count({
				where: {
					organizationId,
					expiresAt: { lt: new Date() },
					status: "ACTIVE",
				},
			}),
			db.ispDealer.count({ where: { organizationId } }),
			db.employee.count({ where: { organizationId } }),
			db.customer.groupBy({
				by: ["planId"],
				where: {
					organizationId,
					status: "ACTIVE",
					planId: { not: null },
				},
				_count: true,
				orderBy: { _count: { planId: "desc" } },
				take: 20,
			}),
			db.ispDealer.findMany({
				where: { organizationId, status: "ACTIVE" },
				select: {
					id: true,
					name: true,
					_count: { select: { customers: true } },
				},
				orderBy: { customers: { _count: "desc" } },
				take: 5,
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
					organizationId,
					status: "ACTIVE",
					monthlyRate: { not: null },
				},
				_sum: { monthlyRate: true },
			}),
			db.$queryRaw<[{ total: number | null }]>`
				SELECT COALESCE(SUM(sp."monthlyPrice"), 0) as total
				FROM "customer" c
				INNER JOIN "service_plan" sp ON sp."id" = c."planId"
				WHERE c."organizationId" = ${organizationId}
				AND c."status" = 'ACTIVE'
				AND c."monthlyRate" IS NULL
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
			dealerCount,
			employeeCount,
			totalMonthlyRevenue,
			planDistribution: planDistribution.map((p) => ({
				planName: p.planId
					? (planNameMap.get(p.planId) ?? "Unknown")
					: "No Plan",
				count: p._count,
			})),
			topDealers: topDealers.map((d) => ({
				id: d.id,
				name: d.name,
				customerCount: d._count.customers,
			})),
		};
	});

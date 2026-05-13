import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getEmployeeStats = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/stats",
		tags: ["Employees"],
		summary: "Get employee dashboard statistics",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const { activeDealerId } = await requirePermission(
			organizationId,
			user.id,
			"employees",
			"read",
		);

		const dealerFilter = getDealerScopeFilter(activeDealerId);
		// Exclude soft-deleted employees from every count/group/find so stats
		// match the employee list view.
		const baseEmployeeWhere = {
			organizationId,
			deletedAt: null,
			...dealerFilter,
		};

		const [
			total,
			active,
			inactive,
			onLeave,
			departmentBreakdown,
			topCollectors,
		] = await Promise.all([
			db.employee.count({
				where: baseEmployeeWhere,
			}),
			db.employee.count({
				where: { ...baseEmployeeWhere, status: "ACTIVE" },
			}),
			db.employee.count({
				where: { ...baseEmployeeWhere, status: "INACTIVE" },
			}),
			db.employee.count({
				where: { ...baseEmployeeWhere, status: "ON_LEAVE" },
			}),
			db.employee.groupBy({
				by: ["department"],
				where: {
					...baseEmployeeWhere,
					status: "ACTIVE",
					department: { not: null },
				},
				_count: true,
				orderBy: { _count: { department: "desc" } },
			}),
			db.employee.findMany({
				where: {
					...baseEmployeeWhere,
					status: "ACTIVE",
					department: "BILLING",
				},
				select: {
					id: true,
					name: true,
					_count: {
						select: {
							customerCollections: true,
						},
					},
				},
				orderBy: {
					customerCollections: { _count: "desc" },
				},
				take: 5,
			}),
		]);

		return {
			total,
			active,
			inactive,
			onLeave,
			departmentBreakdown: departmentBreakdown.map((d) => ({
				department: d.department,
				count: d._count,
			})),
			topCollectors: topCollectors.map((c) => ({
				name: c.name,
				customers: c._count.customerCollections,
			})),
		};
	});

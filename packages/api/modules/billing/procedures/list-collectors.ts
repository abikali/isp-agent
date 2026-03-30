import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listCollectors = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors",
		tags: ["Billing"],
		summary: "List employees who serve as collectors",
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

		// Find employees who are assigned as collectors on customers
		// scoped to the active dealer, or who have the BILLING department
		// and belong to the active dealer
		const collectors = await db.employee.findMany({
			where: {
				organizationId: input.organizationId,
				OR: [
					{ ...dealerFilter, department: "BILLING" },
					{ customerCollections: { some: dealerFilter } },
				],
			},
			select: {
				id: true,
				name: true,
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

		return {
			collectors: collectors.map((c) => ({
				id: c.id,
				name: c.name,
				phone: c.phone,
				department: c.department,
				customerCount: c._count.customerCollections,
			})),
		};
	});

import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		// Find employees who are assigned as collectors on any customer,
		// or who have the BILLING department
		const collectors = await db.employee.findMany({
			where: {
				organizationId: input.organizationId,
				OR: [
					{ department: "BILLING" },
					{ customerCollections: { some: {} } },
				],
			},
			select: {
				id: true,
				name: true,
				phone: true,
				department: true,
				_count: {
					select: { customerCollections: true },
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

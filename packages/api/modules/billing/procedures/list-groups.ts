import {
	getActionScope,
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listCustomerGroups = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/groups",
		tags: ["Billing"],
		summary: "List distinct customer group names for filtering",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"groups",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			groupName: { not: null },
			...getDealerScopeFilter(activeDealerId),
		};

		// Collectors restricted to their own customers (billing collect:own)
		// still only see areas among the customers they collect for.
		const scope = getActionScope(permCtx, "billing", "collect");
		if (scope === "own") {
			const emp = await db.employee.findFirst({
				where: {
					organizationId: input.organizationId,
					userId: user.id,
				},
				select: { id: true },
			});
			if (emp) {
				where["collectorId"] = emp.id;
			}
		}

		const results = await db.customer.findMany({
			where,
			select: { groupName: true },
			distinct: ["groupName"],
			orderBy: { groupName: "asc" },
		});

		return {
			groups: results
				.map((r) => r.groupName)
				.filter((g): g is string => g !== null),
		};
	});

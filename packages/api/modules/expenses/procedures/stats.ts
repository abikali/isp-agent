import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getExpenseStats = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses/stats",
		tags: ["Expenses"],
		summary: "Expense dashboard statistics",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const dealerScope = getDealerScopeFilter(activeDealerId);
		const [pending, approved] = await Promise.all([
			db.expense.aggregate({
				where: {
					organizationId: input.organizationId,
					status: "PENDING",
					submittedBy: dealerScope,
				},
				_count: true,
				_sum: { amount: true },
			}),
			db.expense.aggregate({
				where: {
					organizationId: input.organizationId,
					status: "APPROVED",
					submittedBy: dealerScope,
				},
				_count: true,
				_sum: { amount: true },
			}),
		]);

		return {
			pendingCount: pending._count,
			pendingAmount: pending._sum.amount ?? 0,
			approvedCount: approved._count,
			approvedAmount: approved._sum.amount ?? 0,
		};
	});

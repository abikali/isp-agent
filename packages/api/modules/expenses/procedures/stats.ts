import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const [pending, approved] = await Promise.all([
			db.expense.aggregate({
				where: {
					organizationId: input.organizationId,
					status: "PENDING",
				},
				_count: true,
				_sum: { amount: true },
			}),
			db.expense.aggregate({
				where: {
					organizationId: input.organizationId,
					status: "APPROVED",
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

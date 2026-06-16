import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listExpenses = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses",
		tags: ["Expenses"],
		summary: "List expense claims",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
			employeeId: z.string().optional(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const ownershipFilter = await getOwnershipFilterAsync(
			permCtx,
			"expenses",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			submittedBy: getDealerScopeFilter(activeDealerId),
			...ownershipFilter,
		};
		if (input.status) {
			where["status"] = input.status;
		}
		if (input.employeeId) {
			where["submittedById"] = input.employeeId;
		}
		if (input.from || input.to) {
			where["createdAt"] = {
				...(input.from ? { gte: input.from } : {}),
				...(input.to ? { lte: input.to } : {}),
			};
		}

		const [expenses, total, totalAmountAgg] = await Promise.all([
			db.expense.findMany({
				where,
				include: {
					submittedBy: { select: { id: true, name: true } },
					approvedBy: { select: { id: true, name: true } },
				},
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.expense.count({ where }),
			db.expense.aggregate({ where, _sum: { amount: true } }),
		]);

		return {
			expenses,
			total,
			totalAmount: totalAmountAgg._sum.amount ?? 0,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});

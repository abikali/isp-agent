import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { buildExpenseWhere, expenseFilterSchema } from "../lib/filters";

export const listExpenses = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses",
		tags: ["Expenses"],
		summary: "List expense claims",
	})
	.input(
		expenseFilterSchema.extend({
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum([
					"createdAt",
					"amount",
					"status",
					"approvedAt",
					"category",
				])
				.default("createdAt"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const where = await buildExpenseWhere(permCtx, activeDealerId, input);

		const [expenses, total] = await Promise.all([
			db.expense.findMany({
				where,
				include: {
					submittedBy: { select: { id: true, name: true } },
					approvedBy: { select: { id: true, name: true } },
					createdBy: { select: { id: true, name: true } },
					recurring: { select: { id: true } },
					financeCategory: {
						select: { id: true, label: true, kind: true },
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.expense.count({ where }),
		]);

		return {
			expenses,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});

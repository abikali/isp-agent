import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { protectedProcedure } from "../../../orpc/procedures";
import { buildExpenseWhere, expenseFilterSchema } from "../lib/filters";

/**
 * The numbers on top of the expenses table. Takes the SAME filters as
 * `expenses.list` (minus paging and sorting) so the cards always describe the
 * rows the table is showing — including the ones on later pages.
 */
export const getExpenseSummary = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses/summary",
		tags: ["Expenses"],
		summary: "Totals for the current expense filters",
	})
	.input(expenseFilterSchema)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const where = await buildExpenseWhere(permCtx, activeDealerId, input);

		const [agg, workers, buckets, missingReceipt, categories] =
			await Promise.all([
				db.expense.aggregate({
					where,
					_count: true,
					_sum: { amount: true },
					_avg: { amount: true },
					_max: { amount: true },
				}),
				db.expense.groupBy({ by: ["submittedById"], where }),
				db.expense.groupBy({
					by: ["financeCategoryId"],
					where,
					_sum: { amount: true },
					_count: true,
				}),
				db.expense.count({
					where: { AND: [where, { receiptUrl: null }] },
				}),
				db.financeCategory.findMany({
					where: { organizationId: input.organizationId },
					select: { id: true, label: true },
				}),
			]);

		const labels = new Map(categories.map((c) => [c.id, c.label]));
		const topBucket = buckets
			.map((b) => ({
				id: b.financeCategoryId,
				label:
					(b.financeCategoryId && labels.get(b.financeCategoryId)) ||
					"Uncategorised",
				count: b._count,
				amount: b._sum.amount ?? 0,
			}))
			.sort((a, b) => b.amount - a.amount)[0];

		return {
			count: agg._count,
			totalAmount: agg._sum.amount ?? 0,
			averageAmount: agg._avg.amount ?? 0,
			largestAmount: agg._max.amount ?? 0,
			workerCount: workers.length,
			missingReceipt,
			topBucket: topBucket ?? null,
		};
	});

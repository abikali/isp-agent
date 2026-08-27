import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { protectedProcedure } from "../../../orpc/procedures";
import { buildExpenseWhere, expenseFilterSchema } from "../lib/filters";

/**
 * The choices in the expenses filter bar, derived from the expense rows
 * themselves rather than from the employee directory.
 *
 * Two reasons this is not `employees.list`: that endpoint returns 25 of 263
 * staff (so most submitters were unpickable) and costs 400ms–1s because it
 * carries per-employee customer/task counts and station joins this page never
 * reads. Here the only names offered are the ones that actually appear in the
 * table.
 */
export const getExpenseFilterOptions = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses/filter-options",
		tags: ["Expenses"],
		summary: "Workers, categories and buckets present in expense claims",
	})
	.input(expenseFilterSchema.pick({ organizationId: true, status: true }))
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const where = await buildExpenseWhere(permCtx, activeDealerId, input);

		const [employees, categories, buckets, financeCategories] =
			await Promise.all([
				db.employee.findMany({
					where: { expensesSubmitted: { some: where } },
					select: {
						id: true,
						name: true,
						_count: { select: { expensesSubmitted: { where } } },
					},
					orderBy: { name: "asc" },
				}),
				db.expense.groupBy({ by: ["category"], where, _count: true }),
				db.expense.groupBy({
					by: ["financeCategoryId"],
					where,
					_count: true,
				}),
				db.financeCategory.findMany({
					where: { organizationId: input.organizationId },
					select: { id: true, label: true, kind: true },
					orderBy: { label: "asc" },
				}),
			]);

		const bucketCounts = new Map(
			buckets.map((b) => [b.financeCategoryId, b._count]),
		);
		const uncategorised = bucketCounts.get(null);

		return {
			workers: employees.map((e) => ({
				id: e.id,
				name: e.name,
				count: e._count.expensesSubmitted,
			})),
			categories: categories
				.flatMap((c) =>
					c.category ? [{ value: c.category, count: c._count }] : [],
				)
				.sort((a, b) => a.value.localeCompare(b.value)),
			buckets: [
				...financeCategories.flatMap((c) => {
					const count = bucketCounts.get(c.id);
					return count === undefined ? [] : [{ ...c, count }];
				}),
				...(uncategorised === undefined
					? []
					: [
							{
								id: "none",
								label: "Uncategorised",
								kind: null,
								count: uncategorised,
							},
						]),
			],
		};
	});

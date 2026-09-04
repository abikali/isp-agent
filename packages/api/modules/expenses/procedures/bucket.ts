import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { normaliseDescription } from "../../finance/lib/classify";
import { resolvePeriod, shortMonthLabel } from "../../finance/lib/period";
import { buildExpenseWhere } from "../lib/filters";
import { bustExpenseStats } from "../lib/stats-cache";

const MONTHS_BACK = 6;
const UNCLASSIFIED = {
	id: "none",
	label: "Needs a bucket",
	hint: "Approved spending nobody has classified yet. Give each line a bucket and it leaves this page.",
	kind: null,
	isSystem: true,
} as const;

/**
 * One bucket's story: how much goes into it month by month, which rules and
 * recurring lines feed it, what the money actually was, and the latest rows.
 * `bucketId` "none" is the unclassified pile.
 */
export const getSpendingBucket = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses/buckets/{bucketId}",
		tags: ["Expenses"],
		summary: "Spending detail for one bucket",
	})
	.input(z.object({ organizationId: z.string(), bucketId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);
		const scope = await buildExpenseWhere(permCtx, activeDealerId, {
			organizationId: input.organizationId,
		});
		const isNone = input.bucketId === "none";
		const category = isNone
			? UNCLASSIFIED
			: await db.financeCategory.findFirst({
					where: {
						id: input.bucketId,
						organizationId: input.organizationId,
					},
					select: {
						id: true,
						label: true,
						hint: true,
						kind: true,
						isSystem: true,
					},
				});
		if (!category) {
			throw new ORPCError("NOT_FOUND", { message: "Bucket not found" });
		}
		const financeCategoryId = isNone ? null : category.id;

		const now = new Date();
		const thisMonth = resolvePeriod("this-month", now);
		const windowStart = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth() - (MONTHS_BACK - 1),
				1,
			),
		);
		const inBucket = {
			AND: [scope, { status: "APPROVED" as const }],
			financeCategoryId,
		};

		const [rows, recent, rules, recurring, allTime] = await Promise.all([
			db.expense.findMany({
				where: { ...inBucket, createdAt: { gte: windowStart } },
				select: { amount: true, description: true, createdAt: true },
			}),
			db.expense.findMany({
				where: inBucket,
				orderBy: { createdAt: "desc" },
				take: 40,
				select: {
					id: true,
					amount: true,
					description: true,
					createdAt: true,
					receiptUrl: true,
					category: true,
					submittedBy: { select: { id: true, name: true } },
					createdBy: { select: { id: true, name: true } },
					recurringExpenseId: true,
				},
			}),
			financeCategoryId
				? db.financeRule.findMany({
						where: {
							organizationId: input.organizationId,
							financeCategoryId,
						},
						orderBy: { priority: "desc" },
						select: {
							id: true,
							pattern: true,
							matchType: true,
							createdFromLine: true,
						},
					})
				: [],
			db.recurringExpense.findMany({
				where: {
					organizationId: input.organizationId,
					financeCategoryId,
				},
				orderBy: { amount: "desc" },
				select: {
					id: true,
					amount: true,
					description: true,
					dayOfMonth: true,
					active: true,
				},
			}),
			db.expense.aggregate({
				where: inBucket,
				_sum: { amount: true },
				_count: true,
			}),
		]);

		// Six calendar months, oldest first, every month present even at zero.
		const months: Array<{
			year: number;
			month: number;
			label: string;
			amount: number;
			count: number;
		}> = [];
		for (let i = MONTHS_BACK - 1; i >= 0; i--) {
			const d = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
			);
			months.push({
				year: d.getUTCFullYear(),
				month: d.getUTCMonth() + 1,
				label: shortMonthLabel(d.getUTCFullYear(), d.getUTCMonth() + 1),
				amount: 0,
				count: 0,
			});
		}
		const byKey = new Map(months.map((m) => [`${m.year}-${m.month}`, m]));
		const lines = new Map<
			string,
			{ key: string; sample: string; total: number; count: number }
		>();
		for (const row of rows) {
			const m = byKey.get(
				`${row.createdAt.getUTCFullYear()}-${row.createdAt.getUTCMonth() + 1}`,
			);
			if (m) {
				m.amount += row.amount;
				m.count += 1;
			}
			const key = normaliseDescription(row.description);
			const line = lines.get(key) ?? {
				key,
				sample: row.description,
				total: 0,
				count: 0,
			};
			line.total += row.amount;
			line.count += 1;
			lines.set(key, line);
		}
		const current = months[months.length - 1];
		const previous = months[months.length - 2];

		return {
			bucket: category,
			periodLabel: thisMonth.label,
			thisMonth: current?.amount ?? 0,
			lastMonth: previous?.amount ?? 0,
			allTime: {
				amount: allTime._sum.amount ?? 0,
				count: allTime._count,
			},
			months,
			topLines: [...lines.values()]
				.sort((a, b) => b.total - a.total)
				.slice(0, 6),
			rules,
			recurring,
			recent,
		};
	});

/** Move one row into a bucket (or back out of every bucket with null). */
export const setExpenseBucket = protectedProcedure
	.route({
		method: "PATCH",
		path: "/expenses/{id}/bucket",
		tags: ["Expenses"],
		summary: "Classify one expense into a bucket",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			financeCategoryId: z.string().nullable(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"approve",
		);
		const scope = await buildExpenseWhere(permCtx, activeDealerId, {
			organizationId: input.organizationId,
		});
		if (input.financeCategoryId) {
			const bucket = await db.financeCategory.findFirst({
				where: {
					id: input.financeCategoryId,
					organizationId: input.organizationId,
				},
				select: { id: true },
			});
			if (!bucket) {
				throw new ORPCError("NOT_FOUND", {
					message: "Bucket not found",
				});
			}
		}
		const updated = await db.expense.updateMany({
			where: { AND: [scope, { id: input.id }] },
			data: { financeCategoryId: input.financeCategoryId },
		});
		if (updated.count === 0) {
			throw new ORPCError("NOT_FOUND", { message: "Expense not found" });
		}
		bustExpenseStats();
		return { success: true };
	});

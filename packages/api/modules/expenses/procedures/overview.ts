import { hasPermission, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { previousPeriod, resolvePeriod } from "../../finance/lib/period";
import { buildExpenseWhere } from "../lib/filters";

/** A pending claim older than this needs a decision, whatever its size. */
const STALE_CLAIM_DAYS = 3;
/** A claim at or above this with no photo is worth a second look. */
const BIG_CLAIM_NO_RECEIPT = 100;

/**
 * Everything the Spending page opens with, in one read: what went out this
 * month, what workers are waiting on, what still has no bucket, and the
 * recurring lines. Mirrors dealers.overview so both pages hydrate the same
 * way.
 */
export const getSpendingOverview = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses/overview",
		tags: ["Expenses"],
		summary: "Spending page overview",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);
		const canManage = hasPermission(permCtx, "expenses", "approve");
		const scope = await buildExpenseWhere(permCtx, activeDealerId, {
			organizationId: input.organizationId,
		});

		const now = new Date();
		const period = resolvePeriod("this-month", now);
		const prior = previousPeriod(period);
		const staleBefore = new Date(
			now.getTime() - STALE_CLAIM_DAYS * 24 * 60 * 60 * 1000,
		);
		const approvedIn = (p: { from: Date; to: Date }) => ({
			AND: [scope, { status: "APPROVED" as const }],
			createdAt: { gte: p.from, lt: p.to },
		});

		const [
			thisMonth,
			lastMonth,
			directThisMonth,
			pending,
			unclassified,
			bucketsThisMonth,
			bucketsLastMonth,
			categories,
			staleClaims,
			noReceiptClaims,
			recurring,
		] = await Promise.all([
			db.expense.aggregate({
				where: approvedIn(period),
				_sum: { amount: true },
				_count: true,
			}),
			db.expense.aggregate({
				where: approvedIn(prior),
				_sum: { amount: true },
			}),
			db.expense.aggregate({
				where: { ...approvedIn(period), submittedById: null },
				_sum: { amount: true },
			}),
			db.expense.aggregate({
				where: { AND: [scope, { status: "PENDING" }] },
				_sum: { amount: true },
				_count: true,
			}),
			db.expense.aggregate({
				where: {
					AND: [scope, { status: "APPROVED" }],
					financeCategoryId: null,
				},
				_sum: { amount: true },
				_count: true,
			}),
			db.expense.groupBy({
				by: ["financeCategoryId"],
				where: approvedIn(period),
				_sum: { amount: true },
				_count: true,
			}),
			db.expense.groupBy({
				by: ["financeCategoryId"],
				where: approvedIn(prior),
				_sum: { amount: true },
			}),
			db.financeCategory.findMany({
				where: {
					organizationId: input.organizationId,
					archivedAt: null,
				},
				orderBy: { sortOrder: "asc" },
				select: { id: true, label: true, hint: true, kind: true },
			}),
			db.expense.findMany({
				where: {
					AND: [scope, { status: "PENDING" }],
					createdAt: { lt: staleBefore },
				},
				orderBy: { createdAt: "asc" },
				take: 4,
				select: {
					id: true,
					amount: true,
					description: true,
					createdAt: true,
					receiptUrl: true,
					submittedBy: { select: { id: true, name: true } },
				},
			}),
			db.expense.findMany({
				where: {
					AND: [scope, { status: "PENDING" }],
					receiptUrl: null,
					amount: { gte: BIG_CLAIM_NO_RECEIPT },
				},
				orderBy: { amount: "desc" },
				take: 4,
				select: {
					id: true,
					amount: true,
					description: true,
					createdAt: true,
					receiptUrl: true,
					submittedBy: { select: { id: true, name: true } },
				},
			}),
			db.recurringExpense.findMany({
				where: { organizationId: input.organizationId },
				orderBy: [{ active: "desc" }, { amount: "desc" }],
				select: {
					id: true,
					amount: true,
					description: true,
					dayOfMonth: true,
					active: true,
					lastGeneratedMonth: true,
					financeCategory: {
						select: { id: true, label: true },
					},
					createdBy: { select: { name: true } },
				},
			}),
		]);

		const thisByBucket = new Map(
			bucketsThisMonth.map((b) => [
				b.financeCategoryId,
				{ amount: b._sum.amount ?? 0, count: b._count },
			]),
		);
		const lastByBucket = new Map(
			bucketsLastMonth.map((b) => [
				b.financeCategoryId,
				b._sum.amount ?? 0,
			]),
		);
		const buckets = [
			...categories.map((c) => ({
				id: c.id,
				label: c.label,
				hint: c.hint,
				kind: c.kind,
				amount: thisByBucket.get(c.id)?.amount ?? 0,
				count: thisByBucket.get(c.id)?.count ?? 0,
				previous: lastByBucket.get(c.id) ?? 0,
			})),
			{
				id: "none",
				label: "Needs a bucket",
				hint: "Approved spending nobody has classified yet. It lands as Uncategorised on the P&L.",
				kind: null,
				amount: thisByBucket.get(null)?.amount ?? 0,
				count: thisByBucket.get(null)?.count ?? 0,
				previous: lastByBucket.get(null) ?? 0,
			},
		];

		return {
			periodLabel: period.label,
			canManage,
			totals: {
				spent: thisMonth._sum.amount ?? 0,
				spentCount: thisMonth._count,
				spentLastMonth: lastMonth._sum.amount ?? 0,
				direct: directThisMonth._sum.amount ?? 0,
				pending: pending._sum.amount ?? 0,
				pendingCount: pending._count,
				unclassified: unclassified._sum.amount ?? 0,
				unclassifiedCount: unclassified._count,
			},
			buckets,
			attention: { staleClaims, noReceiptClaims },
			recurring,
			recurringTotal: recurring
				.filter((r) => r.active)
				.reduce((sum, r) => sum + r.amount, 0),
		};
	});

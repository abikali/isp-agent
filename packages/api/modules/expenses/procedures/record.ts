import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveBucketFromRules } from "../lib/resolve-bucket";
import { bustExpenseStats } from "../lib/stats-cache";

/**
 * An owner enters a cost directly — rent paid, a licence, the maintenance
 * fee. Unlike a worker's claim it is not a reimbursement: it is saved
 * approved, carries no worker, and never moves anyone's cash balance. It goes
 * straight into its bucket on the P&L.
 */
export const recordExpense = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/record",
		tags: ["Expenses"],
		summary: "Record a company expense directly (no worker claim)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			amount: z.number().positive(),
			description: z.string().trim().min(1).max(2000),
			financeCategoryId: z.string().optional(),
			/** When the money went out; defaults to now. */
			date: z.coerce.date().optional(),
			receiptUrl: z.string().max(1000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"approve",
		);
		if (activeDealerId) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only the operator records company expenses",
			});
		}
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
		const financeCategoryId =
			input.financeCategoryId ??
			(await resolveBucketFromRules(
				input.organizationId,
				input.description,
			));
		const now = new Date();
		const expense = await db.expense.create({
			data: {
				organizationId: input.organizationId,
				submittedById: null,
				createdById: user.id,
				amount: input.amount,
				description: input.description,
				financeCategoryId,
				receiptUrl: input.receiptUrl ?? null,
				status: "APPROVED",
				approvedById: user.id,
				approvedAt: now,
				createdAt: input.date ?? now,
			},
			include: { financeCategory: { select: { id: true, label: true } } },
		});
		bustExpenseStats();
		return { expense };
	});

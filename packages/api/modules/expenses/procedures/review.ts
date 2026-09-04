import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { expenseDeductionAmount } from "../../billing/lib/cash-signs";
import { expenseDealerScope } from "../lib/filters";
import { bustExpenseStats } from "../lib/stats-cache";

export const approveExpense = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/{id}/approve",
		tags: ["Expenses"],
		summary: "Approve an expense (records an expense-deduction cash entry)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"approve",
		);

		const expense = await db.expense.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...expenseDealerScope(activeDealerId),
			},
			select: {
				id: true,
				status: true,
				amount: true,
				description: true,
				submittedById: true,
				submittedBy: { select: { name: true } },
			},
		});
		if (!expense) {
			throw new ORPCError("NOT_FOUND", { message: "Expense not found" });
		}
		if (expense.status !== "PENDING") {
			throw new ORPCError("CONFLICT", {
				message: "Expense has already been reviewed",
			});
		}

		const updated = await db.$transaction(async (tx) => {
			const result = await tx.expense.update({
				where: { id: expense.id },
				data: {
					status: "APPROVED",
					approvedById: user.id,
					approvedAt: new Date(),
				},
			});
			// A direct row (no worker) is company spending, not a reimbursement:
			// nothing to deduct from anyone's cash.
			if (!expense.submittedById) {
				return result;
			}
			await tx.cashCollection.create({
				data: {
					organizationId: input.organizationId,
					collectorId: expense.submittedById,
					amount: expenseDeductionAmount(expense.amount),
					type: "EXPENSE_DEDUCTION",
					expenseId: expense.id,
					receivedById: user.id,
					notes: `Approved expense: ${expense.description.slice(0, 200)}`,
				},
			});
			return result;
		});

		if (expense.submittedById) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: expense.submittedById,
				title: "Expense approved",
				message: `Your $${expense.amount.toFixed(2)} expense was approved`,
				type: "success",
				telegramText: tgMessage({
					icon: "✅",
					title: "Expense approved",
					fields: [
						{
							icon: "💰",
							label: "Amount",
							value: `$${expense.amount.toFixed(2)}`,
							copyable: true,
						},
					],
				}),
			}).catch((err: unknown) =>
				logger.warn("[Expense Approve] notify failed", {
					error: String(err),
				}),
			);
		}

		bustExpenseStats();
		return { expense: updated };
	});

export const rejectExpense = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/{id}/reject",
		tags: ["Expenses"],
		summary: "Reject an expense claim",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			reason: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"approve",
		);

		const expense = await db.expense.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...expenseDealerScope(activeDealerId),
			},
			select: {
				id: true,
				status: true,
				amount: true,
				submittedById: true,
			},
		});
		if (!expense) {
			throw new ORPCError("NOT_FOUND", { message: "Expense not found" });
		}
		if (expense.status !== "PENDING") {
			throw new ORPCError("CONFLICT", {
				message: "Expense has already been reviewed",
			});
		}

		const updated = await db.expense.update({
			where: { id: expense.id },
			data: {
				status: "REJECTED",
				approvedById: user.id,
				approvedAt: new Date(),
				rejectedReason: input.reason ?? null,
			},
		});

		if (expense.submittedById) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: expense.submittedById,
				title: "Expense rejected",
				message: `Your $${expense.amount.toFixed(2)} expense was rejected${input.reason ? `: ${input.reason}` : ""}`,
				type: "warning",
				telegramText: tgMessage({
					icon: "⛔",
					title: "Expense rejected",
					fields: [
						{
							icon: "💰",
							label: "Amount",
							value: `$${expense.amount.toFixed(2)}`,
							copyable: true,
						},
						input.reason
							? {
									icon: "✍️",
									label: "Reason",
									value: input.reason,
								}
							: null,
					],
				}),
			}).catch((err: unknown) =>
				logger.warn("[Expense Reject] notify failed", {
					error: String(err),
				}),
			);
		}

		bustExpenseStats();
		return { expense: updated };
	});

import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { expenseDeductionAmount } from "../../billing/lib/cash-signs";

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
				submittedBy: getDealerScopeFilter(activeDealerId),
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

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: expense.submittedById,
			title: "Expense approved",
			message: `Your $${expense.amount.toFixed(2)} expense was approved`,
			type: "success",
		}).catch((err: unknown) =>
			logger.warn("[Expense Approve] notify failed", {
				error: String(err),
			}),
		);

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
				submittedBy: getDealerScopeFilter(activeDealerId),
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

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: expense.submittedById,
			title: "Expense rejected",
			message: `Your $${expense.amount.toFixed(2)} expense was rejected${input.reason ? `: ${input.reason}` : ""}`,
			type: "warning",
		}).catch((err: unknown) =>
			logger.warn("[Expense Reject] notify failed", {
				error: String(err),
			}),
		);

		return { expense: updated };
	});

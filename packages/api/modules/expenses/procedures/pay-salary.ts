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

/**
 * Pay a worker his salary (ad-hoc).
 *
 * A salary payout is folded into the Expenses pipeline: it creates an
 * already-APPROVED expense on the worker's behalf plus the offsetting
 * positive EXPENSE_DEDUCTION cash entry, in one transaction — identical to
 * `approveExpense`. This reduces the worker's owed cash, surfaces in the
 * accounting reports' `totalExpenses`, and shows in his wallet ledger.
 */
export const paySalary = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/pay-salary",
		tags: ["Expenses"],
		summary: "Pay a worker his salary (records an approved salary expense)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			workerId: z.string(),
			amount: z.number().finite().positive(),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"approve",
		);

		const worker = await db.employee.findFirst({
			where: {
				id: input.workerId,
				organizationId: input.organizationId,
				status: "ACTIVE",
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!worker) {
			throw new ORPCError("NOT_FOUND", {
				message: "Worker not found or inactive",
			});
		}

		const description = input.notes?.trim()
			? `Salary: ${input.notes.trim()}`
			: "Salary";

		const expense = await db.$transaction(async (tx) => {
			const created = await tx.expense.create({
				data: {
					organizationId: input.organizationId,
					submittedById: input.workerId,
					amount: input.amount,
					description,
					category: "salary",
					status: "APPROVED",
					approvedById: user.id,
					approvedAt: new Date(),
				},
			});
			await tx.cashCollection.create({
				data: {
					organizationId: input.organizationId,
					collectorId: input.workerId,
					amount: expenseDeductionAmount(input.amount),
					type: "EXPENSE_DEDUCTION",
					expenseId: created.id,
					receivedById: user.id,
					notes: description.slice(0, 200),
				},
			});
			return created;
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: input.workerId,
			title: "Salary paid",
			message: `You were paid a salary of $${input.amount.toFixed(2)}`,
			type: "success",
		}).catch((err: unknown) =>
			logger.warn("[Pay Salary] notify failed", {
				error: String(err),
			}),
		);

		return { expense };
	});

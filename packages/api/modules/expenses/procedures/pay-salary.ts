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
import {
	expenseDeductionAmount,
	moneyGivenAmount,
} from "../../billing/lib/cash-signs";

/**
 * Give a worker money (advance, salary, reimbursement…).
 *
 * Always creates an already-APPROVED expense (surfacing in the accounting
 * reports' `totalExpenses`) plus a cash-ledger row, in one transaction. The
 * `reduceBalance` flag decides whether it touches the worker's cash in hand:
 *
 *  - `reduceBalance: false` (default) — money came from the company's own
 *    funds. The ledger row is a DISPLAY-ONLY `SALARY` type, excluded from
 *    every balance/handed-off aggregation, so his cash in hand is untouched.
 *  - `reduceBalance: true` — the worker is keeping money he already collected,
 *    so it's an `EXPENSE_DEDUCTION` row (counted in the ledger) that REDUCES
 *    his cash in hand by the amount.
 *
 * `source` is a bookkeeping label (Company cash | Bank | Other) for where the
 * money came from.
 */
export const paySalary = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/pay-salary",
		tags: ["Expenses"],
		summary: "Give a worker money (records an approved company expense)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			workerId: z.string(),
			amount: z.number().finite().positive(),
			notes: z.string().max(500).optional(),
			source: z.string().max(100).optional(),
			// When true, deduct from the worker's collected cash in hand.
			reduceBalance: z.boolean().optional(),
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

		const note = input.notes?.trim();
		const source = input.source?.trim();
		const description = note ? `Money given: ${note}` : "Money given";
		// History note keeps the "for what" plus the funding source.
		const ledgerNote = [
			note ?? "Money given",
			source ? `from ${source}` : null,
		]
			.filter(Boolean)
			.join(" · ");

		const expense = await db.$transaction(async (tx) => {
			const created = await tx.expense.create({
				data: {
					organizationId: input.organizationId,
					submittedById: input.workerId,
					amount: input.amount,
					description,
					category: "salary",
					source: source ?? null,
					status: "APPROVED",
					approvedById: user.id,
					approvedAt: new Date(),
				},
			});
			await tx.cashCollection.create({
				data: {
					organizationId: input.organizationId,
					collectorId: input.workerId,
					amount: input.reduceBalance
						? expenseDeductionAmount(input.amount)
						: moneyGivenAmount(input.amount),
					type: input.reduceBalance ? "EXPENSE_DEDUCTION" : "SALARY",
					expenseId: created.id,
					receivedById: user.id,
					notes: ledgerNote.slice(0, 200),
				},
			});
			return created;
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: input.workerId,
			title: "Money received",
			message: `You were given $${input.amount.toFixed(2)}${note ? ` — ${note}` : ""}`,
			type: "success",
		}).catch((err: unknown) =>
			logger.warn("[Pay Salary] notify failed", {
				error: String(err),
			}),
		);

		return { expense };
	});

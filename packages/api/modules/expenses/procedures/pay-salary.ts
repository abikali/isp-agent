import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	cashFloatAmount,
	expenseDeductionAmount,
	moneyGivenAmount,
} from "../../billing/lib/cash-signs";

/**
 * Move money for a worker — pick where it's taken `from` and where it `to`.
 * The effect on his cash in hand and the books follows from those two:
 *
 *  | from      | to       | cash in hand | books        | ledger type        |
 *  |-----------|----------|--------------|--------------|--------------------|
 *  | company   | in_hand  | ↑            | not an expense | CASH_FLOAT (−)    |
 *  | company   | him      | unchanged    | +expense       | SALARY (excluded) |
 *  | collected | him      | ↓            | +expense       | EXPENSE_DEDUCTION |
 *  | collected | in_hand  | — (rejected: that's already his cash in hand)  |
 *
 * "to him" means the money becomes his to keep → a company expense. "to
 * in_hand" means he's holding our cash and owes it back → not an expense.
 */
export const paySalary = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/pay-salary",
		tags: ["Expenses"],
		summary: "Move money for a worker (give / float / let him keep cash)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			workerId: z.string(),
			amount: z.number().finite().positive(),
			notes: z.string().max(500).optional(),
			from: z.enum(["company", "collected"]).default("company"),
			to: z.enum(["in_hand", "him"]).default("in_hand"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"approve",
		);

		const toInHand = input.to === "in_hand";
		const fromCollected = input.from === "collected";

		// Moving his own collected cash into his cash in hand is a no-op —
		// it's already there.
		if (fromCollected && toInHand) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"That's already his cash in hand — nothing to move. Pick a different source or destination.",
			});
		}

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
		// `to in_hand` = float he holds (raises in-hand, no expense).
		// `to him` = his to keep → a company expense; from-collected lowers his
		// in-hand (EXPENSE_DEDUCTION), from-company leaves it (excluded SALARY).
		const cashType = toInHand
			? "CASH_FLOAT"
			: fromCollected
				? "EXPENSE_DEDUCTION"
				: "SALARY";
		const cashAmount = toInHand
			? cashFloatAmount(input.amount)
			: fromCollected
				? expenseDeductionAmount(input.amount)
				: moneyGivenAmount(input.amount);

		const description = note ? `Money given: ${note}` : "Money given";

		await db.$transaction(async (tx) => {
			// Only money that becomes his to keep (`to him`) is a company expense.
			const expenseId = toInHand
				? null
				: (
						await tx.expense.create({
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
						})
					).id;
			await tx.cashCollection.create({
				data: {
					organizationId: input.organizationId,
					collectorId: input.workerId,
					amount: cashAmount,
					type: cashType,
					expenseId,
					receivedById: user.id,
					notes: (note ?? "Money given").slice(0, 200),
				},
			});
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: input.workerId,
			title: "Money received",
			message: `You were given $${input.amount.toFixed(2)}${note ? ` — ${note}` : ""}`,
			type: "success",
			telegramText: tgMessage({
				icon: "💵",
				title: "Money received",
				fields: [
					{
						icon: "💰",
						label: "Amount",
						value: `$${input.amount.toFixed(2)}`,
						copyable: true,
					},
					note ? { icon: "✍️", label: "Note", value: note } : null,
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Worker Cash] notify failed", {
				error: String(err),
			}),
		);

		return { success: true };
	});

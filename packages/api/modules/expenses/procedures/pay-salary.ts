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
 * Give a worker money — one transaction, an already-APPROVED expense (so it
 * surfaces in the accounting reports' `totalExpenses`) plus a cash-ledger row.
 * The `reason` is just where the money comes from and decides whether it
 * touches his cash in hand:
 *
 *  - `advance` — paid from the company's OWN funds. The ledger row is a
 *    DISPLAY-ONLY `SALARY` type, excluded from every balance sum → his cash in
 *    hand is UNCHANGED.
 *  - `keep_collected` — he keeps money he already collected, so it's an
 *    `EXPENSE_DEDUCTION` row that COUNTS → LOWERS his cash in hand.
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
			reason: z.enum(["advance", "keep_collected"]).default("advance"),
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
		const keepsCollected = input.reason === "keep_collected";

		// `keep_collected` counts in the ledger (lowers his cash in hand);
		// `advance` is a display-only SALARY row that does not.
		const cashType = keepsCollected ? "EXPENSE_DEDUCTION" : "SALARY";
		const cashAmount = keepsCollected
			? expenseDeductionAmount(input.amount)
			: moneyGivenAmount(input.amount);

		const description = note ? `Money given: ${note}` : "Money given";

		await db.$transaction(async (tx) => {
			const expense = await tx.expense.create({
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
					amount: cashAmount,
					type: cashType,
					expenseId: expense.id,
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
		}).catch((err: unknown) =>
			logger.warn("[Worker Cash] notify failed", {
				error: String(err),
			}),
		);

		return { success: true };
	});

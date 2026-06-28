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
	storePurchaseAmount,
} from "../../billing/lib/cash-signs";

/**
 * Record a worker cash entry — one transaction, three reasons. The reason
 * decides the cash-ledger type and whether a company expense is booked:
 *
 *  - `advance` — company pays him from its OWN funds. Books an approved
 *    expense (+`totalExpenses`) plus a DISPLAY-ONLY `SALARY` ledger row that
 *    is excluded from every balance sum → his cash in hand is UNCHANGED.
 *  - `keep_collected` — he keeps money he already collected. Books the same
 *    approved expense plus an `EXPENSE_DEDUCTION` row that COUNTS → LOWERS his
 *    cash in hand.
 *  - `purchase` — he bought a company item out of his collected cash. NO
 *    expense (it's a sale, +company income); a `STORE_PURCHASE` row that
 *    counts → LOWERS his cash in hand.
 *
 * `source` is a bookkeeping label (Company cash | Bank | Other) — only
 * meaningful for `advance`.
 */
export const paySalary = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/pay-salary",
		tags: ["Expenses"],
		summary: "Record a worker cash entry (advance, kept cash, or purchase)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			workerId: z.string(),
			amount: z.number().finite().positive(),
			notes: z.string().max(500).optional(),
			source: z.string().max(100).optional(),
			reason: z
				.enum(["advance", "keep_collected", "purchase"])
				.default("advance"),
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
		const isPurchase = input.reason === "purchase";

		// Cash-ledger row config per reason.
		const cashType = isPurchase
			? "STORE_PURCHASE"
			: input.reason === "keep_collected"
				? "EXPENSE_DEDUCTION"
				: "SALARY";
		const cashAmount = isPurchase
			? storePurchaseAmount(input.amount)
			: input.reason === "keep_collected"
				? expenseDeductionAmount(input.amount)
				: moneyGivenAmount(input.amount);

		const verb = isPurchase ? "Purchase" : "Money given";
		const description = note ? `${verb}: ${note}` : verb;
		// History note keeps the "for what" plus the funding source.
		const ledgerNote = [
			note ?? verb,
			!isPurchase && source ? `from ${source}` : null,
		]
			.filter(Boolean)
			.join(" · ");

		await db.$transaction(async (tx) => {
			// A purchase is a sale (income), NOT a company expense — no expense row.
			const expenseId = isPurchase
				? null
				: (
						await tx.expense.create({
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
					notes: ledgerNote.slice(0, 200),
				},
			});
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: input.workerId,
			title: isPurchase ? "Charged for a purchase" : "Money received",
			message: isPurchase
				? `$${input.amount.toFixed(2)} for a company purchase${note ? ` — ${note}` : ""}`
				: `You were given $${input.amount.toFixed(2)}${note ? ` — ${note}` : ""}`,
			type: "success",
		}).catch((err: unknown) =>
			logger.warn("[Worker Cash] notify failed", {
				error: String(err),
			}),
		);

		return { success: true };
	});

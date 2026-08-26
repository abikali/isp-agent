import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	collectorBalance,
	sumAmountOrZero,
	sumOrZero,
} from "../lib/calculations";
import { EXCLUDE_STOPPED, LEDGER_CASH } from "../lib/filters";
import { resolveCollectorNames } from "../lib/queries";
import { getMonthDateRange, resolveYearMonth } from "../lib/resolve-month";
import { monthSpecSchema } from "../lib/schemas";

export const getAccountingReports = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/reports",
		tags: ["Billing"],
		summary:
			"Per-collector cash breakdown and approved expenses for a period",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				scope: z.enum(["month", "all"]).default("month"),
				billingMonthId: z.string().optional(),
			})
			.merge(monthSpecSchema),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		// Resolve month for "month" scope
		let resolvedMonthId = input.billingMonthId;
		let dateFilter: { gte: Date; lte: Date } | undefined;

		if (input.scope === "month") {
			const { year, month, billingMonthId } = await resolveYearMonth(
				input.organizationId,
				input.year,
				input.month,
			);
			if (!resolvedMonthId) {
				resolvedMonthId = billingMonthId;
			}

			if (resolvedMonthId) {
				const billingMonth = await db.billingMonth.findUnique({
					where: { id: resolvedMonthId },
					select: { year: true, month: true },
				});
				if (billingMonth) {
					dateFilter = getMonthDateRange(
						billingMonth.year,
						billingMonth.month,
					);
				}
			}

			if (!dateFilter) {
				dateFilter = getMonthDateRange(year, month);
			}
		}

		const paymentWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "COLLECTED",
			...EXCLUDE_STOPPED,
			...getDealerScopeViaCustomer(activeDealerId),
		};
		const collectionWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			collector: { dealerId: activeDealerId ?? null },
			// Company-funded rows never move a collector's own balance.
			...LEDGER_CASH,
		};
		const expenseWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "APPROVED",
			submittedBy: { dealerId: activeDealerId ?? null },
		};

		if (resolvedMonthId) {
			paymentWhere["billingMonthId"] = resolvedMonthId;
		}
		if (dateFilter) {
			collectionWhere["collectedAt"] = dateFilter;
			expenseWhere["createdAt"] = dateFilter;
		}

		const [paymentsByCollector, collectionsByCollector] = await Promise.all(
			[
				db.payment.groupBy({
					by: ["collectorId"],
					where: paymentWhere,
					_sum: { paidAmount: true },
					_count: true,
				}),
				db.cashCollection.groupBy({
					by: ["collectorId"],
					where: collectionWhere,
					_sum: { amount: true },
				}),
			],
		);

		// Map collector IDs to names
		const collectorIds = [
			...new Set([
				...paymentsByCollector.map((p) => p.collectorId),
				...collectionsByCollector.map((c) => c.collectorId),
			]),
		];

		const collectorMap = await resolveCollectorNames(collectorIds);

		const handedOffMap = new Map(
			collectionsByCollector.map((c) => [
				c.collectorId,
				sumAmountOrZero(c),
			]),
		);

		const collectorBreakdown = paymentsByCollector.map((p) => {
			const collected = sumOrZero(p);
			const handedOff = handedOffMap.get(p.collectorId) ?? 0;
			return {
				collectorId: p.collectorId,
				name: collectorMap.get(p.collectorId) ?? "Unknown",
				totalCollected: collected,
				paymentCount: p._count,
				totalHandedOff: handedOff,
				balance: collectorBalance(collected, handedOff),
			};
		});

		// Totals
		const totalCollected = collectorBreakdown.reduce(
			(sum, c) => sum + c.totalCollected,
			0,
		);

		// Expenses
		const expensesAgg = await db.expense.aggregate({
			where: expenseWhere,
			_sum: { amount: true },
		});
		const totalExpenses = sumAmountOrZero(expensesAgg);

		// NOTE: this procedure deliberately returns no organization-wide
		// "handed off" or profit figure.
		//
		// It used to return `grandTotal = totalHandedOff − totalExpenses`. That
		// was wrong in two compounding ways. `totalHandedOff` summed every
		// non-SALARY cash-ledger row, which includes `EXPENSE_DEDUCTION` — the
		// mirror of each approved expense — as a POSITIVE amount. Subtracting
		// the same expenses again cancelled them exactly, so expenses moved the
		// headline by zero and what remained was real handoffs minus cash
		// floats: a snapshot of where collectors' cash was sitting, displayed
		// as profit. It reported −$34,199 for July 2026, a month that actually
		// netted +$22,105.
		//
		// Profit now comes from `finance.summary`, which classifies every row
		// as revenue, cost, draw, or transfer exactly once. Per-collector
		// figures below remain valid — they are cash positions, and that is how
		// they are labelled.
		return {
			scope: input.scope,
			collectorBreakdown,
			totalCollected,
			totalExpenses,
		};
	});

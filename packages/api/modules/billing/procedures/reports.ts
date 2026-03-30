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
import {
	getMonthDateRange,
	resolveActiveBillingMonth,
	resolveBillingMonthId,
} from "../lib/resolve-month";

export const getAccountingReports = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/reports",
		tags: ["Billing"],
		summary:
			"Accounting reports: collector breakdown, expenses, grand total",
	})
	.input(
		z.object({
			organizationId: z.string(),
			scope: z.enum(["month", "all"]).default("month"),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
			billingMonthId: z.string().optional(),
		}),
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
			let year = input.year;
			let month = input.month;
			if (year == null || month == null) {
				const active = await resolveActiveBillingMonth(
					input.organizationId,
				);
				year = year ?? active.year;
				month = month ?? active.month;
				if (!resolvedMonthId) {
					resolvedMonthId = active.id;
				}
			}

			if (!resolvedMonthId) {
				resolvedMonthId = await resolveBillingMonthId(
					input.organizationId,
					year,
					month,
				);
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
			...getDealerScopeViaCustomer(activeDealerId),
		};
		const collectionWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			collector: { dealerId: activeDealerId ?? null },
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

		const collectors = await db.employee.findMany({
			where: { id: { in: collectorIds } },
			select: { id: true, name: true },
		});
		const collectorMap = new Map(collectors.map((c) => [c.id, c.name]));

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
		const totalHandedOff = collectorBreakdown.reduce(
			(sum, c) => sum + c.totalHandedOff,
			0,
		);

		// Expenses
		const expensesAgg = await db.expense.aggregate({
			where: expenseWhere,
			_sum: { amount: true },
		});
		const totalExpenses = sumAmountOrZero(expensesAgg);

		const grandTotal = totalHandedOff - totalExpenses;

		return {
			scope: input.scope,
			collectorBreakdown,
			totalCollected,
			totalHandedOff,
			totalExpenses,
			grandTotal,
		};
	});

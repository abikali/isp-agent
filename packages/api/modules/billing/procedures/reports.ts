import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
			billingCycleId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		// Build date filter for "month" scope
		const now = new Date();
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const monthEnd = new Date(
			now.getFullYear(),
			now.getMonth() + 1,
			0,
			23,
			59,
			59,
			999,
		);

		const dateFilter =
			input.scope === "month"
				? { gte: monthStart, lte: monthEnd }
				: undefined;

		const paymentWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		const collectionWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		const expenseWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "APPROVED",
		};

		if (dateFilter) {
			paymentWhere["paidAt"] = dateFilter;
			collectionWhere["collectedAt"] = dateFilter;
			expenseWhere["createdAt"] = dateFilter;
		}

		if (input.billingCycleId) {
			paymentWhere["billingCycleId"] = input.billingCycleId;
		}

		// Get per-collector breakdown
		const paymentsByCollector = await db.payment.groupBy({
			by: ["collectorId"],
			where: paymentWhere,
			_sum: { paidAmount: true },
			_count: true,
		});

		const collectionsByCollector = await db.cashCollection.groupBy({
			by: ["collectorId"],
			where: collectionWhere,
			_sum: { amount: true },
		});

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

		// Build a map of handed-off amounts
		const handedOffMap = new Map(
			collectionsByCollector.map((c) => [
				c.collectorId,
				c._sum.amount ?? 0,
			]),
		);

		const collectorBreakdown = paymentsByCollector.map((p) => ({
			collectorId: p.collectorId,
			name: collectorMap.get(p.collectorId) ?? "Unknown",
			totalCollected: p._sum.paidAmount ?? 0,
			paymentCount: p._count,
			totalHandedOff: handedOffMap.get(p.collectorId) ?? 0,
			balance:
				(p._sum.paidAmount ?? 0) -
				(handedOffMap.get(p.collectorId) ?? 0),
		}));

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
		const totalExpenses = expensesAgg._sum.amount ?? 0;

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

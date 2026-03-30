import {
	getDealerScopeViaCustomer,
	NO_DEALER,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	calculateInHandBalance,
	sumAmountOrZero,
	sumOrZero,
} from "../lib/calculations";
import { getCycleDateRange, resolveBillingCycleId } from "../lib/resolve-cycle";

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
		const { activeDealerId, activeBillingYear, activeBillingMonth } =
			await requirePermission(
				input.organizationId,
				user.id,
				"billing",
				"manage",
			);

		// Resolve cycle for "month" scope
		let resolvedCycleId = input.billingCycleId;
		let dateFilter: { gte: Date; lte: Date } | undefined;

		if (input.scope === "month") {
			if (!resolvedCycleId) {
				resolvedCycleId = await resolveBillingCycleId(
					input.organizationId,
					activeBillingYear,
					activeBillingMonth,
				);
				// Derive date range from org's active billing period
				const now = new Date();
				const year = activeBillingYear ?? now.getFullYear();
				const month = activeBillingMonth ?? now.getMonth() + 1;
				dateFilter = getCycleDateRange(year, month);
			} else {
				// Specific cycle provided — derive date range from it
				const cycle = await db.billingCycle.findUnique({
					where: { id: resolvedCycleId },
					select: { year: true, month: true },
				});
				if (cycle) {
					dateFilter = getCycleDateRange(cycle.year, cycle.month);
				}
			}
		}

		const paymentWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			...getDealerScopeViaCustomer(activeDealerId),
		};
		const dealerFilter = activeDealerId ?? NO_DEALER;
		const collectionWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			collector: { dealerId: dealerFilter },
		};
		const expenseWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "APPROVED",
			submittedBy: { dealerId: dealerFilter },
		};

		if (resolvedCycleId) {
			paymentWhere["billingCycleId"] = resolvedCycleId;
		}
		if (dateFilter) {
			collectionWhere["collectedAt"] = dateFilter;
			expenseWhere["createdAt"] = dateFilter;
		}

		// Get per-collector breakdown
		const pendingPaymentWhere: Record<string, unknown> = {
			...paymentWhere,
			status: PaymentStatus.PENDING,
		};

		const [
			paymentsByCollector,
			pendingByCollector,
			collectionsByCollector,
		] = await Promise.all([
			db.payment.groupBy({
				by: ["collectorId"],
				where: paymentWhere,
				_sum: { paidAmount: true },
				_count: true,
			}),
			db.payment.groupBy({
				by: ["collectorId"],
				where: pendingPaymentWhere,
				_sum: { paidAmount: true },
			}),
			db.cashCollection.groupBy({
				by: ["collectorId"],
				where: collectionWhere,
				_sum: { amount: true },
			}),
		]);

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

		// Build maps for handed-off amounts and pending balances
		const handedOffMap = new Map(
			collectionsByCollector.map((c) => [
				c.collectorId,
				sumAmountOrZero(c),
			]),
		);
		const pendingMap = new Map(
			pendingByCollector.map((p) => [p.collectorId, sumOrZero(p)]),
		);

		const collectorBreakdown = paymentsByCollector.map((p) => {
			const pending = pendingMap.get(p.collectorId) ?? 0;
			const handedOff = handedOffMap.get(p.collectorId) ?? 0;
			return {
				collectorId: p.collectorId,
				name: collectorMap.get(p.collectorId) ?? "Unknown",
				totalCollected: sumOrZero(p),
				paymentCount: p._count,
				totalHandedOff: handedOff,
				balance: calculateInHandBalance(pending, handedOff),
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

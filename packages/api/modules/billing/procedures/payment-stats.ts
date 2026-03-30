import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";
import {
	getMonthDateRange,
	resolveActiveBillingMonth,
	resolveBillingMonthId,
} from "../lib/resolve-month";

export const getPaymentStats = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/payments/stats",
		tags: ["Billing"],
		summary: "Get payment statistics for a billing month",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingMonthId: z.string().optional(),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		let year = input.year;
		let month = input.month;
		let resolvedMonthId: string | undefined;
		if (year == null || month == null) {
			const active = await resolveActiveBillingMonth(
				input.organizationId,
			);
			year = year ?? active.year;
			month = month ?? active.month;
			resolvedMonthId = active.id;
		}
		const monthRange = getMonthDateRange(year, month);

		const monthId =
			input.billingMonthId ??
			resolvedMonthId ??
			(await resolveBillingMonthId(input.organizationId, year, month));

		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const baseWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			...(monthId ? { billingMonthId: monthId } : {}),
			...dealerViaCustomer,
		};

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && employeeId) {
			baseWhere["collectorId"] = employeeId;
		}

		// Build the unpaid filter: active customers with expiry in this month
		// who have no COLLECTED payment for this month
		const unpaidWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "ACTIVE",
			// Allow null groupNames through — Prisma's NOT excludes nulls
			OR: [
				{ groupName: null },
				{
					NOT: {
						groupName: { equals: "free", mode: "insensitive" },
					},
				},
			],
			expiresAt: monthRange,
			...dealerFilter,
		};
		if (monthId) {
			unpaidWhere["payments"] = {
				none: { billingMonthId: monthId, status: "COLLECTED" },
			};
		}

		const [
			collectedPayments,
			stoppedPayments,
			totalCollected,
			byCollector,
			paidCustomerIds,
			unpaidCustomers,
		] = await Promise.all([
			db.payment.count({
				where: { ...baseWhere, status: "COLLECTED" },
			}),
			db.payment.count({
				where: { ...baseWhere, status: "STOPPED" },
			}),
			db.payment.aggregate({
				where: { ...baseWhere, status: "COLLECTED" },
				_sum: { paidAmount: true },
			}),
			db.payment.groupBy({
				by: ["collectorId"],
				where: { ...baseWhere, status: "COLLECTED" },
				_sum: { paidAmount: true },
				_count: true,
			}),
			// Paid customers: distinct customers with a COLLECTED payment this month
			monthId
				? db.payment.findMany({
						where: {
							...baseWhere,
							status: "COLLECTED",
						},
						select: { customerId: true },
						distinct: ["customerId"],
					})
				: Promise.resolve([]),
			// Unpaid customers: expiry falls in this month, no COLLECTED payment
			db.customer.count({ where: unpaidWhere }),
		]);

		const paidCustomers = paidCustomerIds.length;
		// Total = those who paid (expiry already moved) + those still due (expiry in month)
		const totalCustomers = paidCustomers + unpaidCustomers;

		// Resolve collector names
		const collectorIds = byCollector.map((c) => c.collectorId);
		const collectors =
			collectorIds.length > 0
				? await db.employee.findMany({
						where: { id: { in: collectorIds } },
						select: { id: true, name: true },
					})
				: [];
		const collectorMap = new Map(collectors.map((c) => [c.id, c.name]));

		const collectorBreakdown = byCollector.map((c) => ({
			collectorId: c.collectorId,
			collectorName: collectorMap.get(c.collectorId) ?? "Unknown",
			totalCollected: sumOrZero(c),
			paymentCount: c._count,
		}));

		return {
			collectedPayments,
			stoppedPayments,
			totalCollected: sumOrZero(totalCollected),
			collectorBreakdown,
			paidCustomers,
			unpaidCustomers,
			totalCustomers,
			paidPercentage:
				totalCustomers > 0
					? Math.floor((paidCustomers / totalCustomers) * 100)
					: 0,
		};
	});

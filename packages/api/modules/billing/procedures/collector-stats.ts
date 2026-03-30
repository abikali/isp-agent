import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	resolveCollectorScope,
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
} from "../lib/resolve-month";

export const getCollectorStats = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors/stats",
		tags: ["Billing"],
		summary:
			"Get collector dashboard stats (bills count, money collected, daily wallet)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		let collectorId = input.collectorId;
		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own") {
			if (!employeeId) {
				throw new ORPCError("FORBIDDEN", {
					message: "No employee record found",
				});
			}
			collectorId = employeeId;
		}

		if (!collectorId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "collectorId is required",
			});
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		// Use the active billing month (latest unlocked), not the calendar month
		const activeMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);
		const monthRange = getMonthDateRange(
			activeMonth.year,
			activeMonth.month,
		);

		// Allow null groupNames through — Prisma's NOT excludes nulls
		const excludeFreeGroup = {
			OR: [
				{ groupName: null },
				{
					NOT: {
						groupName: {
							equals: "free",
							mode: "insensitive" as const,
						},
					},
				},
			],
		};

		const dealerFilter = getDealerScopeFilter(activeDealerId);
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const [
			unpaidCustomers,
			paidCustomerIds,
			totalPayments,
			dailyPayments,
			totalHandedOff,
		] = await Promise.all([
			// Unpaid customers: expiry up to this month (includes past-due), no COLLECTED payment
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "ACTIVE",
					expiresAt: { lte: monthRange.lte },
					payments: {
						none: {
							billingMonthId: activeMonth.id,
							status: "COLLECTED",
						},
					},
					...excludeFreeGroup,
					...dealerFilter,
				},
			}),
			// Paid customers this month: distinct customerIds with COLLECTED payment
			db.payment.findMany({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "COLLECTED",
					billingMonthId: activeMonth.id,
					...dealerViaCustomer,
				},
				select: { customerId: true },
				distinct: ["customerId"],
			}),
			// Total amount collected (all time, for balance calc — not dealer-scoped)
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "COLLECTED",
					workerId: null,
				},
				_sum: { paidAmount: true },
			}),
			// Daily collected (today only)
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "COLLECTED",
					paidAt: { gte: today, lt: tomorrow },
					...dealerViaCustomer,
				},
				_sum: { paidAmount: true },
				_count: true,
			}),
			// Total cash handed off
			db.cashCollection.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
				},
				_sum: { amount: true },
			}),
		]);

		const totalCollected = sumOrZero(totalPayments);
		const handedOff = sumAmountOrZero(totalHandedOff);
		const paidCustomers = paidCustomerIds.length;
		const totalCustomers = paidCustomers + unpaidCustomers;

		return {
			collectorId,
			totalCustomers,
			paidCustomers,
			totalCollected,
			totalHandedOff: handedOff,
			netBalance: collectorBalance(totalCollected, handedOff),
			dailyCollected: sumOrZero(dailyPayments),
			dailyCount: dailyPayments._count,
		};
	});

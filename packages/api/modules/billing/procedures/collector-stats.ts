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
import { sumOrZero } from "../lib/calculations";
import {
	countPaidCustomers,
	fetchCollectorBalance,
	fetchRelevantBillingMonths,
	unpaidCustomersWhere,
} from "../lib/queries";
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

		const dealerFilter = getDealerScopeFilter(activeDealerId);
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const [
			unpaidCustomers,
			paidCustomers,
			stoppedCustomers,
			balanceData,
			dailyPayments,
		] = await Promise.all([
			// Unpaid customers: expiry up to this month (includes past-due), no payment at all
			fetchRelevantBillingMonths(
				input.organizationId,
				activeMonth.year,
				activeMonth.month,
			).then((relevantMonths) =>
				db.customer.count({
					where: unpaidCustomersWhere(
						input.organizationId,
						activeMonth.id,
						monthRange,
						{ collectorId, dealerFilter, relevantMonths },
					),
				}),
			),
			// Paid customers this month: distinct customerIds with real payment
			// (paidAmount > 0 — includes stopped-with-pay, excludes stopped-no-pay)
			countPaidCustomers(input.organizationId, activeMonth.id, {
				collectorId,
				paidAmount: { gt: 0 },
				...dealerViaCustomer,
			}),
			// Stopped customers this month: distinct customerIds with stoppedAccount payment
			db.payment
				.findMany({
					where: {
						organizationId: input.organizationId,
						billingMonthId: activeMonth.id,
						collectorId,
						stoppedAccount: true,
						...dealerViaCustomer,
					},
					select: { customerId: true },
					distinct: ["customerId"],
				})
				.then((ids) => ids.length),
			// Balance: physical cash collected − handed off (not dealer-scoped)
			fetchCollectorBalance(input.organizationId, collectorId),
			// Daily collected (today only) — only real cash, not stopped-no-pay
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
					workerId: null,
					paidAmount: { gt: 0 },
					paidAt: { gte: today, lt: tomorrow },
					...dealerViaCustomer,
				},
				_sum: { paidAmount: true },
				_count: true,
			}),
		]);

		// Stopped+paid customers count as "paid" (collector has the cash).
		// unpaidCustomersWhere already excludes anyone with a payment (including stopped).
		const totalCustomers = paidCustomers + unpaidCustomers;

		return {
			collectorId,
			totalCustomers,
			paidCustomers,
			stoppedCustomers,
			totalCollected: balanceData.totalCollected,
			totalHandedOff: balanceData.totalHandedOff,
			netBalance: balanceData.balance,
			dailyCollected: sumOrZero(dailyPayments),
			dailyCount: dailyPayments._count,
		};
	});

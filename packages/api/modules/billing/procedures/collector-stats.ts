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

		const [unpaidCustomers, paidCustomers, balanceData, dailyPayments] =
			await Promise.all([
				// Unpaid customers: expiry up to this month (includes past-due), no COLLECTED payment
				db.customer.count({
					where: unpaidCustomersWhere(
						input.organizationId,
						activeMonth.id,
						monthRange,
						{ collectorId, dealerFilter },
					),
				}),
				// Paid customers this month: distinct customerIds with COLLECTED payment
				countPaidCustomers(input.organizationId, activeMonth.id, {
					collectorId,
					...dealerViaCustomer,
				}),
				// Balance: physical cash collected − handed off (not dealer-scoped)
				fetchCollectorBalance(input.organizationId, collectorId),
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
			]);

		const totalCustomers = paidCustomers + unpaidCustomers;

		return {
			collectorId,
			totalCustomers,
			paidCustomers,
			totalCollected: balanceData.totalCollected,
			totalHandedOff: balanceData.totalHandedOff,
			netBalance: balanceData.balance,
			dailyCollected: sumOrZero(dailyPayments),
			dailyCount: dailyPayments._count,
		};
	});

import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	calculateInHandBalance,
	sumAmountOrZero,
	sumOrZero,
} from "../lib/calculations";

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
		// Use billing:view for basic access check (collectors have this)
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

		// All queries in parallel
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const excludeFreeGroup = {
			NOT: {
				groupName: { equals: "free", mode: "insensitive" as const },
			},
		};

		const dealerFilter = getDealerScopeFilter(activeDealerId);
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const [
			totalCustomers,
			paidCustomers,
			totalPayments,
			pendingPayments,
			dailyPayments,
			totalHandedOff,
		] = await Promise.all([
			// Total customers assigned to this collector (excluding free group)
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "ACTIVE",
					...excludeFreeGroup,
					...dealerFilter,
				},
			}),
			// Paid customers this cycle (excluding free group)
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "ACTIVE",
					paidCurrentCycle: true,
					...excludeFreeGroup,
					...dealerFilter,
				},
			}),
			// Total amount collected (all time)
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
					...dealerViaCustomer,
				},
				_sum: { paidAmount: true },
				_count: true,
			}),
			// Pending payments — cash physically with the collector
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: PaymentStatus.PENDING,
					...dealerViaCustomer,
				},
				_sum: { paidAmount: true },
			}),
			// Daily collected (today only)
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
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
		const pending = sumOrZero(pendingPayments);

		return {
			collectorId,
			totalCustomers,
			paidCustomers,
			totalCollected,
			totalHandedOff: handedOff,
			netBalance: calculateInHandBalance(pending, handedOff),
			dailyCollected: sumOrZero(dailyPayments),
			dailyCount: dailyPayments._count,
		};
	});

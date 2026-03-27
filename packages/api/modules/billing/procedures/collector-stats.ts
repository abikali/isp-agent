import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		const { permCtx } = await requirePermission(
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

		const [
			totalCustomers,
			paidCustomers,
			totalPayments,
			dailyPayments,
			totalHandedOff,
		] = await Promise.all([
			// Total customers assigned to this collector
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "ACTIVE",
				},
			}),
			// Paid customers this cycle
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					collectorId,
					status: "ACTIVE",
					paidCurrentCycle: true,
				},
			}),
			// Total amount collected (all time in current cycle)
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
				},
				_sum: { paidAmount: true },
				_count: true,
			}),
			// Daily collected (today only)
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId,
					paidAt: { gte: today, lt: tomorrow },
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

		const totalCollected = totalPayments._sum.paidAmount ?? 0;
		const handedOff = totalHandedOff._sum.amount ?? 0;

		return {
			collectorId,
			totalCustomers,
			paidCustomers,
			totalCollected,
			totalHandedOff: handedOff,
			netBalance: totalCollected - handedOff,
			dailyCollected: dailyPayments._sum.paidAmount ?? 0,
			dailyCount: dailyPayments._count,
		};
	});

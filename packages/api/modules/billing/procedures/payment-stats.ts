import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getPaymentStats = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/payments/stats",
		tags: ["Billing"],
		summary: "Get payment statistics for a billing cycle",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingCycleId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		// Get or resolve current cycle
		let cycleId = input.billingCycleId;
		if (!cycleId) {
			const now = new Date();
			const cycle = await db.billingCycle.findUnique({
				where: {
					organizationId_year_month: {
						organizationId: input.organizationId,
						year: now.getFullYear(),
						month: now.getMonth() + 1,
					},
				},
			});
			cycleId = cycle?.id;
		}

		const baseWhere = {
			organizationId: input.organizationId,
			...(cycleId ? { billingCycleId: cycleId } : {}),
		};

		const [
			totalPayments,
			processedPayments,
			pendingPayments,
			partialPayments,
			stoppedPayments,
			totalCollected,
			byCollector,
			unpaidCustomers,
			totalCustomers,
		] = await Promise.all([
			db.payment.count({ where: baseWhere }),
			db.payment.count({ where: { ...baseWhere, status: "PROCESSED" } }),
			db.payment.count({ where: { ...baseWhere, status: "PENDING" } }),
			db.payment.count({ where: { ...baseWhere, status: "PARTIAL" } }),
			db.payment.count({ where: { ...baseWhere, status: "STOPPED" } }),
			db.payment.aggregate({
				where: baseWhere,
				_sum: { paidAmount: true },
			}),
			db.payment.groupBy({
				by: ["collectorId"],
				where: baseWhere,
				_sum: { paidAmount: true },
				_count: true,
			}),
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					paidCurrentCycle: false,
					status: "ACTIVE",
				},
			}),
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					status: "ACTIVE",
				},
			}),
		]);

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
			totalCollected: c._sum.paidAmount ?? 0,
			paymentCount: c._count,
		}));

		return {
			totalPayments,
			processedPayments,
			pendingPayments,
			partialPayments,
			stoppedPayments,
			totalCollected: totalCollected._sum.paidAmount ?? 0,
			collectorBreakdown,
			unpaidCustomers,
			totalCustomers,
			paidPercentage:
				totalCustomers > 0
					? Math.round(
							((totalCustomers - unpaidCustomers) /
								totalCustomers) *
								100,
						)
					: 0,
		};
	});

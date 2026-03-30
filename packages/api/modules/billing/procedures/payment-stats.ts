import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";
import { resolveBillingCycleId } from "../lib/resolve-cycle";

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
		const {
			permCtx,
			activeDealerId,
			activeBillingYear,
			activeBillingMonth,
		} = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const cycleId =
			input.billingCycleId ??
			(await resolveBillingCycleId(
				input.organizationId,
				activeBillingYear,
				activeBillingMonth,
			));

		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const baseWhere: Record<string, unknown> = {
			organizationId: input.organizationId,
			...(cycleId ? { billingCycleId: cycleId } : {}),
			...dealerViaCustomer,
		};

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && employeeId) {
			baseWhere["collectorId"] = employeeId;
		}

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
			db.payment.count({
				where: { ...baseWhere, status: PaymentStatus.PROCESSED },
			}),
			db.payment.count({
				where: { ...baseWhere, status: PaymentStatus.PENDING },
			}),
			db.payment.count({
				where: { ...baseWhere, status: PaymentStatus.PARTIAL },
			}),
			db.payment.count({
				where: { ...baseWhere, status: PaymentStatus.STOPPED },
			}),
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
					NOT: { groupName: { equals: "free", mode: "insensitive" } },
					...dealerFilter,
				},
			}),
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					status: "ACTIVE",
					NOT: { groupName: { equals: "free", mode: "insensitive" } },
					...dealerFilter,
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
			totalCollected: sumOrZero(c),
			paymentCount: c._count,
		}));

		return {
			totalPayments,
			processedPayments,
			pendingPayments,
			partialPayments,
			stoppedPayments,
			totalCollected: sumOrZero(totalCollected),
			collectorBreakdown,
			unpaidCustomers,
			totalCustomers,
			paidPercentage:
				totalCustomers > 0
					? unpaidCustomers === 0
						? 100
						: Math.min(
								99,
								Math.round(
									((totalCustomers - unpaidCustomers) /
										totalCustomers) *
										100,
								),
							)
					: 0,
		};
	});

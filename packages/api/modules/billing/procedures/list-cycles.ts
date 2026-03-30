import { NO_DEALER, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";

export const listCycles = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/cycles",
		tags: ["Billing"],
		summary: "List billing cycles with payment stats",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const dealerFilter = activeDealerId ?? NO_DEALER;
		const paymentFilter = {
			customer: { dealerId: dealerFilter },
		};

		const [cycles, paymentSums] = await Promise.all([
			db.billingCycle.findMany({
				where: { organizationId: input.organizationId },
				orderBy: [{ year: "desc" }, { month: "desc" }],
				include: {
					_count: {
						select: {
							payments: { where: paymentFilter },
						},
					},
				},
			}),
			db.payment.groupBy({
				by: ["billingCycleId"],
				where: {
					organizationId: input.organizationId,
					stoppedAccount: false,
					customer: { dealerId: dealerFilter },
				},
				_sum: { paidAmount: true },
			}),
		]);

		const sumByCycle = new Map(
			paymentSums.map((s) => [s.billingCycleId, sumOrZero(s)]),
		);

		return {
			cycles: cycles.map((cycle) => ({
				id: cycle.id,
				organizationId: cycle.organizationId,
				year: cycle.year,
				month: cycle.month,
				status: cycle.status,
				openedAt: cycle.openedAt,
				closedAt: cycle.closedAt,
				createdAt: cycle.createdAt,
				updatedAt: cycle.updatedAt,
				paymentCount: cycle._count.payments,
				totalCollected: sumByCycle.get(cycle.id) ?? 0,
			})),
		};
	});

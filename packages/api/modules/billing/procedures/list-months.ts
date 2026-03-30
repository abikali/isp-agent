import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";

export const listMonths = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/months",
		tags: ["Billing"],
		summary: "List billing months with payment stats",
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

		const paymentFilter = {
			customer: { dealerId: activeDealerId ?? null },
			status: "COLLECTED" as const,
		};

		const [months, paymentSums] = await Promise.all([
			db.billingMonth.findMany({
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
				by: ["billingMonthId"],
				where: {
					organizationId: input.organizationId,
					status: "COLLECTED",
					customer: { dealerId: activeDealerId ?? null },
				},
				_sum: { paidAmount: true },
			}),
		]);

		const sumByMonth = new Map(
			paymentSums.map((s) => [s.billingMonthId, sumOrZero(s)]),
		);

		return {
			months: months.map((m) => ({
				id: m.id,
				organizationId: m.organizationId,
				year: m.year,
				month: m.month,
				locked: m.locked,
				createdAt: m.createdAt,
				updatedAt: m.updatedAt,
				paymentCount: m._count.payments,
				totalCollected: sumByMonth.get(m.id) ?? 0,
			})),
		};
	});

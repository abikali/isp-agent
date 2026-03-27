import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getCollectorBalance = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors/balance",
		tags: ["Billing"],
		summary:
			"Calculate net balance for a collector (collected - handed off)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const [paymentsAgg, collectionsAgg] = await Promise.all([
			db.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
				},
				_sum: { paidAmount: true },
			}),
			db.cashCollection.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
				},
				_sum: { amount: true },
			}),
		]);

		const totalCollected = paymentsAgg._sum.paidAmount ?? 0;
		const totalHandedOff = collectionsAgg._sum.amount ?? 0;
		const balance = totalCollected - totalHandedOff;

		return { totalCollected, totalHandedOff, balance };
	});

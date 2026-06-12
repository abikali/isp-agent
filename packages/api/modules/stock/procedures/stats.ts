import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getStockStats = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/stats",
		tags: ["Stock"],
		summary: "Stock dashboard statistics",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);

		const items = await db.stockItem.findMany({
			where: { organizationId: input.organizationId },
			select: {
				quantity: true,
				costPrice: true,
				sellPrice: true,
				alertEnabled: true,
				alertThreshold: true,
			},
		});

		const workerAllocations = await db.workerStock.groupBy({
			by: ["employeeId"],
			where: {
				quantity: { gt: 0 },
				stockItem: { organizationId: input.organizationId },
			},
			_sum: { quantity: true },
		});

		return {
			itemCount: items.length,
			adminQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
			stockValueCost: items.reduce(
				(sum, i) => sum + i.quantity * i.costPrice,
				0,
			),
			stockValueSell: items.reduce(
				(sum, i) => sum + i.quantity * i.sellPrice,
				0,
			),
			lowStockCount: items.filter(
				(i) =>
					i.alertEnabled &&
					i.alertThreshold !== null &&
					i.quantity <= i.alertThreshold,
			).length,
			workersHoldingStock: workerAllocations.length,
		};
	});

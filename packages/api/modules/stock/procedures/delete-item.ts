import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteStockItem = protectedProcedure
	.route({
		method: "DELETE",
		path: "/stock/items/{id}",
		tags: ["Stock"],
		summary: "Delete a stock item",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"delete",
		);

		const item = await db.stockItem.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			include: {
				_count: {
					select: {
						workerAllocations: { where: { quantity: { gt: 0 } } },
						installations: true,
					},
				},
			},
		});
		if (!item) {
			throw new ORPCError("NOT_FOUND", {
				message: "Stock item not found",
			});
		}

		if (item._count.workerAllocations > 0) {
			throw new ORPCError("CONFLICT", {
				message:
					"Workers still hold this item — return their stock before deleting",
			});
		}
		if (item._count.installations > 0) {
			throw new ORPCError("CONFLICT", {
				message:
					"This item is referenced by installations and cannot be deleted",
			});
		}

		await db.stockItem.delete({ where: { id: input.id } });

		return { success: true };
	});

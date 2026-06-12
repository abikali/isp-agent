import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const addStockQuantity = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/items/{id}/add-quantity",
		tags: ["Stock"],
		summary: "Add (or adjust) admin stock quantity",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			quantity: z
				.number()
				.int()
				.refine((v) => v !== 0, "Quantity cannot be zero"),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"update",
		);

		const existing = await db.stockItem.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Stock item not found",
			});
		}

		const item = await db.$transaction(async (tx) => {
			const updated = await tx.stockItem.update({
				where: { id: input.id },
				data: { quantity: { increment: input.quantity } },
			});
			if (updated.quantity < 0) {
				throw new ORPCError("CONFLICT", {
					message: "Resulting quantity would be negative",
				});
			}
			await tx.stockLog.create({
				data: {
					organizationId: input.organizationId,
					stockItemId: updated.id,
					performedById: user.id,
					action: input.quantity > 0 ? "ADD" : "ADJUST",
					itemName: updated.name,
					quantity: Math.abs(input.quantity),
					adminQtyBefore: updated.quantity - input.quantity,
					adminQtyAfter: updated.quantity,
					notes: input.notes ?? null,
				},
			});
			return updated;
		});

		return { item };
	});

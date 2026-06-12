import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createStockItem = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/items",
		tags: ["Stock"],
		summary: "Create a stock item",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(255),
			quantity: z.number().int().min(0).default(0),
			costPrice: z.number().min(0).default(0),
			sellPrice: z.number().min(0).default(0),
			alertThreshold: z.number().int().min(0).optional(),
			alertEnabled: z.boolean().default(false),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"create",
		);

		const existing = await db.stockItem.findUnique({
			where: {
				organizationId_name: {
					organizationId: input.organizationId,
					name: input.name,
				},
			},
			select: { id: true },
		});
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: "An item with this name already exists",
			});
		}

		const item = await db.$transaction(async (tx) => {
			const created = await tx.stockItem.create({
				data: {
					organizationId: input.organizationId,
					name: input.name,
					quantity: input.quantity,
					costPrice: input.costPrice,
					sellPrice: input.sellPrice,
					alertThreshold: input.alertThreshold ?? null,
					alertEnabled: input.alertEnabled,
				},
			});
			if (input.quantity > 0) {
				await tx.stockLog.create({
					data: {
						organizationId: input.organizationId,
						stockItemId: created.id,
						performedById: user.id,
						action: "ADD",
						itemName: created.name,
						quantity: input.quantity,
						adminQtyBefore: 0,
						adminQtyAfter: input.quantity,
						notes: "Initial quantity",
					},
				});
			}
			return created;
		});

		return { item };
	});

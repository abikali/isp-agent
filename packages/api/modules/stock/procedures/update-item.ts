import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateStockItem = protectedProcedure
	.route({
		method: "PATCH",
		path: "/stock/items/{id}",
		tags: ["Stock"],
		summary: "Update a stock item (name, prices, alert settings)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(255).optional(),
			costPrice: z.number().min(0).optional(),
			sellPrice: z.number().min(0).optional(),
			alertThreshold: z.number().int().min(0).nullable().optional(),
			alertEnabled: z.boolean().optional(),
			showInUninstall: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"update",
		);

		const item = await db.stockItem.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!item) {
			throw new ORPCError("NOT_FOUND", {
				message: "Stock item not found",
			});
		}

		if (input.name) {
			const duplicate = await db.stockItem.findFirst({
				where: {
					organizationId: input.organizationId,
					name: input.name,
					id: { not: input.id },
				},
				select: { id: true },
			});
			if (duplicate) {
				throw new ORPCError("CONFLICT", {
					message: "An item with this name already exists",
				});
			}
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.costPrice !== undefined) {
			updateData["costPrice"] = input.costPrice;
		}
		if (input.sellPrice !== undefined) {
			updateData["sellPrice"] = input.sellPrice;
		}
		if (input.alertThreshold !== undefined) {
			updateData["alertThreshold"] = input.alertThreshold;
		}
		if (input.alertEnabled !== undefined) {
			updateData["alertEnabled"] = input.alertEnabled;
		}
		if (input.showInUninstall !== undefined) {
			updateData["showInUninstall"] = input.showInUninstall;
		}

		const updated = await db.stockItem.update({
			where: { id: input.id },
			data: updateData,
		});

		return { item: updated };
	});

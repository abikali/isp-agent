import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteCollection = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/collections/delete",
		tags: ["Billing"],
		summary: "Delete a cash collection record",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectionId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const collection = await db.cashCollection.findFirst({
			where: {
				id: input.collectionId,
				organizationId: input.organizationId,
			},
		});

		if (!collection) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collection record not found",
			});
		}

		await db.cashCollection.delete({
			where: { id: input.collectionId },
		});

		return { success: true };
	});

import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteDealer = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/delete",
		tags: ["Dealers"],
		summary: "Soft-delete a dealer (set status to INACTIVE)",
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
			"dealers",
			"delete",
		);

		const existing = await db.ispDealer.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Dealer not found",
			});
		}

		await db.ispDealer.update({
			where: { id: input.id },
			data: { status: "INACTIVE" },
		});

		return { success: true };
	});

import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const deleteDealer = adminProcedure
	.route({
		method: "POST",
		path: "/admin/dealers/delete",
		tags: ["Dealers"],
		summary: "Soft-delete a dealer (admin only)",
	})
	.input(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const existing = await db.ispDealer.findFirst({
			where: { id: input.id },
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

import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
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
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can delete dealers",
			});
		}

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

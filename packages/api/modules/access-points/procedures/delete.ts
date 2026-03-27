import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteAccessPoint = protectedProcedure
	.route({
		method: "POST",
		path: "/access-points/delete",
		tags: ["AccessPoints"],
		summary: "Delete an access point",
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
				message: "Only organization admins can delete access points",
			});
		}

		const existing = await db.accessPoint.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			include: {
				_count: {
					select: { customers: true },
				},
			},
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Access point not found",
			});
		}

		if (existing._count.customers > 0) {
			throw new ORPCError("CONFLICT", {
				message: `Cannot delete access point with ${existing._count.customers} customer(s). Reassign them first.`,
			});
		}

		await db.accessPoint.delete({
			where: { id: input.id },
		});

		return { success: true };
	});

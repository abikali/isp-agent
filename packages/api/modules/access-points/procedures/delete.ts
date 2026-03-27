import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(
			input.organizationId,
			user.id,
			"accessPoints",
			"delete",
		);

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

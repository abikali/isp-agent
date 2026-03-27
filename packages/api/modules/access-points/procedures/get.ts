import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getAccessPoint = protectedProcedure
	.route({
		method: "GET",
		path: "/access-points/{id}",
		tags: ["AccessPoints"],
		summary: "Get a single access point",
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
			"read",
		);

		const accessPoint = await db.accessPoint.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
			include: {
				station: { select: { id: true, name: true } },
				_count: {
					select: { customers: true },
				},
			},
		});

		if (!accessPoint) {
			throw new ORPCError("NOT_FOUND", {
				message: "Access point not found",
			});
		}

		return { accessPoint };
	});

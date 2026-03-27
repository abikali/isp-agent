import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
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
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

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

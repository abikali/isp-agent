import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getStation = protectedProcedure
	.route({
		method: "GET",
		path: "/stations/{id}",
		tags: ["Stations"],
		summary: "Get a single station",
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

		const station = await db.station.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
			include: {
				_count: {
					select: { customers: true },
				},
			},
		});

		if (!station) {
			throw new ORPCError("NOT_FOUND", {
				message: "Station not found",
			});
		}

		return { station };
	});

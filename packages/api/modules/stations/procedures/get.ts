import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomers,
	requirePermission,
} from "@repo/api/lib/permission";
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
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"stations",
			"read",
		);

		const station = await db.station.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomers(activeDealerId),
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

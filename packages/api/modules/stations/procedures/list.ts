import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listStations = protectedProcedure
	.route({
		method: "GET",
		path: "/stations",
		tags: ["Stations"],
		summary: "List stations for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		await requirePermission(organizationId, user.id, "stations", "read");

		const stations = await db.station.findMany({
			where: { organizationId },
			select: {
				id: true,
				name: true,
				address: true,
				latitude: true,
				longitude: true,
				status: true,
				capacity: true,
				notes: true,
				createdAt: true,
				_count: {
					select: { customers: true, employees: true },
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return { stations };
	});

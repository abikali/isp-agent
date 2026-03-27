import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listAccessPoints = protectedProcedure
	.route({
		method: "GET",
		path: "/access-points",
		tags: ["AccessPoints"],
		summary: "List access points for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		await requirePermission(
			organizationId,
			user.id,
			"accessPoints",
			"read",
		);

		const accessPoints = await db.accessPoint.findMany({
			where: { organizationId },
			select: {
				id: true,
				name: true,
				ipAddress: true,
				macAddress: true,
				signal: true,
				boardName: true,
				version: true,
				online: true,
				isUbiquiti: true,
				interface: true,
				uptime: true,
				stationId: true,
				externalId: true,
				createdAt: true,
				station: { select: { id: true, name: true } },
				_count: { select: { customers: true } },
			},
			orderBy: { name: "asc" },
		});

		return { accessPoints };
	});

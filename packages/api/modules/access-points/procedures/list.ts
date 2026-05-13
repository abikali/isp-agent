import {
	getDealerScopeViaCustomers,
	requirePermission,
} from "@repo/api/lib/permission";
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
			search: z.string().optional(),
			stationId: z.string().optional(),
			online: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"accessPoints",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			// Hide access points soft-deleted by the iRadius sync cleanup.
			deletedAt: null,
		};

		if (input.stationId) {
			where["stationId"] = input.stationId;
		}
		if (input.online !== undefined) {
			where["online"] = input.online;
		}
		Object.assign(where, getDealerScopeViaCustomers(activeDealerId));
		if (input.search) {
			where["OR"] = [
				{ name: { contains: input.search, mode: "insensitive" } },
				{
					ipAddress: {
						contains: input.search,
						mode: "insensitive",
					},
				},
				{
					macAddress: {
						contains: input.search,
						mode: "insensitive",
					},
				},
			];
		}

		const accessPoints = await db.accessPoint.findMany({
			where,
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

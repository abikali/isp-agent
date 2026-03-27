import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createAccessPoint = protectedProcedure
	.route({
		method: "POST",
		path: "/access-points",
		tags: ["AccessPoints"],
		summary: "Create a new access point",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			stationId: z.string().optional(),
			externalId: z.string().optional(),
			macAddress: z.string().max(100).optional(),
			ipAddress: z.string().max(100).optional(),
			signal: z.string().max(100).optional(),
			boardName: z.string().max(100).optional(),
			version: z.string().max(100).optional(),
			interface: z.string().max(100).optional(),
			uptime: z.string().max(100).optional(),
			isUbiquiti: z.boolean().default(false),
			online: z.boolean().default(false),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"accessPoints",
			"create",
		);

		const accessPoint = await db.accessPoint.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				stationId: input.stationId ?? null,
				externalId: input.externalId ?? null,
				macAddress: input.macAddress ?? null,
				ipAddress: input.ipAddress ?? null,
				signal: input.signal ?? null,
				boardName: input.boardName ?? null,
				version: input.version ?? null,
				interface: input.interface ?? null,
				uptime: input.uptime ?? null,
				isUbiquiti: input.isUbiquiti,
				online: input.online,
			},
			select: {
				id: true,
				name: true,
				ipAddress: true,
				macAddress: true,
				online: true,
				isUbiquiti: true,
				stationId: true,
				createdAt: true,
			},
		});

		return { accessPoint };
	});

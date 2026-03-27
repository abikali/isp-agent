import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateAccessPoint = protectedProcedure
	.route({
		method: "POST",
		path: "/access-points/update",
		tags: ["AccessPoints"],
		summary: "Update an access point",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
			stationId: z.string().optional(),
			externalId: z.string().optional(),
			macAddress: z.string().max(100).optional(),
			ipAddress: z.string().max(100).optional(),
			signal: z.string().max(100).optional(),
			boardName: z.string().max(100).optional(),
			version: z.string().max(100).optional(),
			interface: z.string().max(100).optional(),
			uptime: z.string().max(100).optional(),
			isUbiquiti: z.boolean().optional(),
			online: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"accessPoints",
			"update",
		);

		const existing = await db.accessPoint.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Access point not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.stationId !== undefined) {
			updateData["stationId"] = input.stationId ?? null;
		}
		if (input.externalId !== undefined) {
			updateData["externalId"] = input.externalId ?? null;
		}
		if (input.macAddress !== undefined) {
			updateData["macAddress"] = input.macAddress ?? null;
		}
		if (input.ipAddress !== undefined) {
			updateData["ipAddress"] = input.ipAddress ?? null;
		}
		if (input.signal !== undefined) {
			updateData["signal"] = input.signal ?? null;
		}
		if (input.boardName !== undefined) {
			updateData["boardName"] = input.boardName ?? null;
		}
		if (input.version !== undefined) {
			updateData["version"] = input.version ?? null;
		}
		if (input.interface !== undefined) {
			updateData["interface"] = input.interface ?? null;
		}
		if (input.uptime !== undefined) {
			updateData["uptime"] = input.uptime ?? null;
		}
		if (input.isUbiquiti !== undefined) {
			updateData["isUbiquiti"] = input.isUbiquiti;
		}
		if (input.online !== undefined) {
			updateData["online"] = input.online;
		}

		const accessPoint = await db.accessPoint.update({
			where: { id: input.id },
			data: updateData,
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

import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
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
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can create access points",
			});
		}

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

import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, stationAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateStation = protectedProcedure
	.route({
		method: "POST",
		path: "/stations/update",
		tags: ["Stations"],
		summary: "Update a station",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
			address: z.string().max(500).optional(),
			latitude: z.number().min(-90).max(90).optional(),
			longitude: z.number().min(-180).max(180).optional(),
			status: z.enum(["ACTIVE", "MAINTENANCE", "OFFLINE"]).optional(),
			capacity: z.number().int().min(1).optional(),
			notes: z.string().max(2000).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can update stations",
			});
		}

		const existing = await db.station.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Station not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.address !== undefined) {
			updateData["address"] = input.address ?? null;
		}
		if (input.latitude !== undefined) {
			updateData["latitude"] = input.latitude ?? null;
		}
		if (input.longitude !== undefined) {
			updateData["longitude"] = input.longitude ?? null;
		}
		if (input.status !== undefined) {
			updateData["status"] = input.status;
		}
		if (input.capacity !== undefined) {
			updateData["capacity"] = input.capacity ?? null;
		}
		if (input.notes !== undefined) {
			updateData["notes"] = input.notes ?? null;
		}

		const station = await db.station.update({
			where: { id: input.id },
			data: updateData,
			select: {
				id: true,
				name: true,
				address: true,
				status: true,
				capacity: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		stationAudit.updated(
			station.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { station };
	});

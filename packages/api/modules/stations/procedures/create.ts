import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, stationAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createStation = protectedProcedure
	.route({
		method: "POST",
		path: "/stations",
		tags: ["Stations"],
		summary: "Create a new station",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			address: z.string().max(500).optional(),
			latitude: z.number().min(-90).max(90).optional(),
			longitude: z.number().min(-180).max(180).optional(),
			status: z
				.enum(["ACTIVE", "MAINTENANCE", "OFFLINE"])
				.default("ACTIVE"),
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
				message: "Only organization admins can create stations",
			});
		}

		const station = await db.station.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				address: input.address ?? null,
				latitude: input.latitude ?? null,
				longitude: input.longitude ?? null,
				status: input.status,
				capacity: input.capacity ?? null,
				notes: input.notes ?? null,
			},
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
		stationAudit.created(
			station.id,
			user.id,
			input.organizationId,
			auditContext,
			{ name: input.name },
		);

		return { station };
	});

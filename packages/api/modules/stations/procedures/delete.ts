import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, stationAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteStation = protectedProcedure
	.route({
		method: "POST",
		path: "/stations/delete",
		tags: ["Stations"],
		summary: "Delete a station",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can delete stations",
			});
		}

		const existing = await db.station.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			include: {
				_count: {
					select: { customers: true },
				},
			},
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Station not found",
			});
		}

		if (existing._count.customers > 0) {
			throw new ORPCError("CONFLICT", {
				message: `Cannot delete station with ${existing._count.customers} customer(s). Reassign them first.`,
			});
		}

		await db.station.delete({
			where: { id: input.id },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		stationAudit.deleted(
			input.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});

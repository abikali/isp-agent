import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(
			input.organizationId,
			user.id,
			"stations",
			"delete",
		);

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

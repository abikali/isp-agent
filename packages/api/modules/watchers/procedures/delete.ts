import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, watcherAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteWatcher = protectedProcedure
	.route({
		method: "POST",
		path: "/watchers/{watcherId}/delete",
		tags: ["Watchers"],
		summary: "Delete a watcher",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can delete watchers",
			});
		}

		const existing = await db.watcher.findFirst({
			where: {
				id: input.watcherId,
				organizationId: input.organizationId,
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Watcher not found",
			});
		}

		await db.watcher.delete({
			where: { id: input.watcherId },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		watcherAudit.deleted(
			input.watcherId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});

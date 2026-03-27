import { ORPCError } from "@orpc/server";
import { requirePermission, verifyPermission } from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, watcherAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const toggleEnabled = protectedProcedure
	.route({
		method: "POST",
		path: "/watchers/{watcherId}/toggle",
		tags: ["Watchers"],
		summary: "Enable or disable a watcher",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
			enabled: z.boolean(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"watchers",
			"update",
		);

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

		verifyPermission(permCtx, "watchers", "update", {
			resourceCreatedById: existing.createdById,
		});

		const updateData: Record<string, unknown> = {
			enabled: input.enabled,
		};

		// Reset state when re-enabling
		if (input.enabled && !existing.enabled) {
			updateData["status"] = "unknown";
			updateData["consecutiveFails"] = 0;
			updateData["consecutiveOk"] = 0;
			updateData["notifiedDownAt"] = null;
			updateData["nextRunAt"] = new Date();
		}

		const watcher = await db.watcher.update({
			where: { id: input.watcherId },
			data: updateData,
		});

		const auditContext = getAuditContextFromHeaders(headers);
		watcherAudit.toggled(
			input.watcherId,
			user.id,
			input.organizationId,
			auditContext,
			{ enabled: input.enabled },
		);

		return { watcher };
	});

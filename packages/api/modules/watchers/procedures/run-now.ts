import { ORPCError } from "@orpc/server";
import { requirePermission, verifyPermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queueWatcherCheck } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const runNow = protectedProcedure
	.route({
		method: "POST",
		path: "/watchers/{watcherId}/run",
		tags: ["Watchers"],
		summary: "Trigger an immediate watcher check",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"watchers",
			"update",
		);

		const watcher = await db.watcher.findFirst({
			where: {
				id: input.watcherId,
				organizationId: input.organizationId,
			},
			select: {
				id: true,
				type: true,
				target: true,
				config: true,
				createdById: true,
			},
		});

		if (!watcher) {
			throw new ORPCError("NOT_FOUND", {
				message: "Watcher not found",
			});
		}

		verifyPermission(permCtx, "watchers", "update", {
			resourceCreatedById: watcher.createdById,
		});

		await queueWatcherCheck({
			watcherId: watcher.id,
			type: watcher.type,
			target: watcher.target,
			config: watcher.config as Record<string, unknown> | null,
		});

		return { success: true };
	});

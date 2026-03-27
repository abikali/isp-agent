import { ORPCError } from "@orpc/server";
import { requirePermission, verifyPermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const get = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers/{watcherId}",
		tags: ["Watchers"],
		summary: "Get a watcher with recent executions",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const [{ permCtx }, watcher] = await Promise.all([
			requirePermission(
				input.organizationId,
				user.id,
				"watchers",
				"read",
			),
			db.watcher.findFirst({
				where: {
					id: input.watcherId,
					organizationId: input.organizationId,
				},
				include: {
					executions: {
						orderBy: { createdAt: "desc" },
						take: 5,
					},
				},
			}),
		]);

		if (!watcher) {
			throw new ORPCError("NOT_FOUND", {
				message: "Watcher not found",
			});
		}

		verifyPermission(permCtx, "watchers", "read", {
			resourceCreatedById: watcher.createdById,
		});

		return { watcher };
	});

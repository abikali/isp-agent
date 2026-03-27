import {
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const list = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers",
		tags: ["Watchers"],
		summary: "List watchers for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const { permCtx } = await requirePermission(
			organizationId,
			user.id,
			"watchers",
			"read",
		);

		const ownerFilter = await getOwnershipFilterAsync(
			permCtx,
			"watchers",
			"read",
		);

		const watchers = await db.watcher.findMany({
			where: { organizationId, ...ownerFilter },
			select: {
				id: true,
				name: true,
				type: true,
				target: true,
				intervalSeconds: true,
				enabled: true,
				status: true,
				lastCheckedAt: true,
				lastStatusChange: true,
				consecutiveFails: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});

		return { watchers };
	});

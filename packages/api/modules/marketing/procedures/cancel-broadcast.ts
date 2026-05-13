import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const cancelBroadcast = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/broadcasts/{broadcastId}/cancel",
		tags: ["Marketing"],
		summary: "Cancel a running marketing broadcast",
	})
	.input(
		z.object({
			organizationId: z.string(),
			broadcastId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"send",
		);

		const broadcast = await db.marketingBroadcast.findFirst({
			where: {
				id: input.broadcastId,
				organizationId: input.organizationId,
			},
			select: { id: true, status: true },
		});
		if (!broadcast) {
			throw new ORPCError("NOT_FOUND", {
				message: "Broadcast not found",
			});
		}

		if (broadcast.status === "completed" || broadcast.status === "failed") {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot cancel a ${broadcast.status} broadcast.`,
			});
		}

		await db.marketingBroadcast.update({
			where: { id: broadcast.id },
			data: {
				status: "cancelled",
				completedAt: new Date(),
			},
		});

		return { success: true };
	});

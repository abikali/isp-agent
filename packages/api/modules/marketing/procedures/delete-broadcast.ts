import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Permanently delete a broadcast and its recipient rows. Only allowed for
 * terminal states (completed/failed/cancelled) so we never delete a job
 * that the queue is mid-processing. Cancel first, then delete.
 */
export const deleteBroadcast = protectedProcedure
	.route({
		method: "DELETE",
		path: "/marketing/broadcasts/{broadcastId}",
		tags: ["Marketing"],
		summary: "Delete a broadcast",
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

		if (broadcast.status === "running") {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Cancel the broadcast first — a running broadcast can't be deleted while the worker is processing it.",
			});
		}

		// onDelete: Cascade on MarketingBroadcastRecipient.broadcastId handles
		// recipient cleanup automatically.
		await db.marketingBroadcast.delete({
			where: { id: broadcast.id },
		});

		return { success: true };
	});

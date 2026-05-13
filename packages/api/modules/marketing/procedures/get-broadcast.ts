import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getBroadcast = protectedProcedure
	.route({
		method: "GET",
		path: "/marketing/broadcasts/{broadcastId}",
		tags: ["Marketing"],
		summary: "Get a marketing broadcast with paginated recipients",
	})
	.input(
		z.object({
			organizationId: z.string(),
			broadcastId: z.string(),
			recipientPage: z.number().int().min(1).default(1),
			recipientPageSize: z.number().int().min(10).max(200).default(50),
			recipientStatus: z.enum(["queued", "sent", "failed"]).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);

		const broadcast = await db.marketingBroadcast.findFirst({
			where: {
				id: input.broadcastId,
				organizationId: input.organizationId,
			},
		});
		if (!broadcast) {
			throw new ORPCError("NOT_FOUND", {
				message: "Broadcast not found",
			});
		}

		const recipientWhere: Record<string, unknown> = {
			broadcastId: broadcast.id,
		};
		if (input.recipientStatus) {
			recipientWhere["status"] = input.recipientStatus;
		}

		const [recipientTotal, recipients] = await Promise.all([
			db.marketingBroadcastRecipient.count({
				where: recipientWhere as never,
			}),
			db.marketingBroadcastRecipient.findMany({
				where: recipientWhere as never,
				orderBy: { createdAt: "asc" },
				skip: (input.recipientPage - 1) * input.recipientPageSize,
				take: input.recipientPageSize,
				select: {
					id: true,
					customerId: true,
					phone: true,
					contactName: true,
					status: true,
					saltiMessageId: true,
					waMessageId: true,
					errorMessage: true,
					sentAt: true,
				},
			}),
		]);

		return {
			broadcast,
			recipients,
			recipientTotal,
			recipientPage: input.recipientPage,
			recipientPageSize: input.recipientPageSize,
		};
	});

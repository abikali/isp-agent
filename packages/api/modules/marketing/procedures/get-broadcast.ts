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
			recipientSearch: z.string().trim().optional(),
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
			include: {
				// Surface who created the broadcast so the detail panel can
				// show "Sent by <name>" without a second client-side round-trip.
				// Better Auth users live in the same DB so this is one join.
			},
		});
		if (!broadcast) {
			throw new ORPCError("NOT_FOUND", {
				message: "Broadcast not found",
			});
		}

		const creator = await db.user.findUnique({
			where: { id: broadcast.createdById },
			select: { id: true, name: true, email: true, image: true },
		});

		const recipientWhere: Record<string, unknown> = {
			broadcastId: broadcast.id,
		};
		if (input.recipientStatus) {
			recipientWhere["status"] = input.recipientStatus;
		}
		if (input.recipientSearch && input.recipientSearch.length > 0) {
			recipientWhere["OR"] = [
				{
					phone: {
						contains: input.recipientSearch,
						mode: "insensitive",
					},
				},
				{
					contactName: {
						contains: input.recipientSearch,
						mode: "insensitive",
					},
				},
			];
		}

		const [recipientTotal, recipients, statusCounts] = await Promise.all([
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
			db.marketingBroadcastRecipient.groupBy({
				by: ["status"],
				where: { broadcastId: broadcast.id },
				_count: { _all: true },
			}),
		]);

		const counts = {
			queued: 0,
			sent: 0,
			failed: 0,
		};
		for (const row of statusCounts) {
			const key = row.status as keyof typeof counts;
			if (key in counts) {
				counts[key] = row._count._all;
			}
		}

		return {
			broadcast,
			creator,
			recipients,
			recipientTotal,
			recipientPage: input.recipientPage,
			recipientPageSize: input.recipientPageSize,
			recipientCounts: counts,
		};
	});

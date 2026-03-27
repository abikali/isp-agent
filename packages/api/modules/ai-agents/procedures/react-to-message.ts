import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const reactToMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/messages/{messageId}/react",
		tags: ["AI Agents"],
		summary: "Add or toggle a reaction on a message",
	})
	.input(
		z.object({
			messageId: z.string(),
			organizationId: z.string(),
			emoji: z.string().min(1).max(8),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		// Verify message belongs to this org
		const message = await db.aiMessage.findFirst({
			where: { id: input.messageId },
			include: {
				conversation: {
					include: {
						agent: { select: { organizationId: true } },
					},
				},
			},
		});

		if (
			!message ||
			message.conversation.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Message not found",
			});
		}

		// Toggle: if reaction exists, remove it; otherwise, add it
		const existing = await db.aiMessageReaction.findUnique({
			where: {
				messageId_userId: {
					messageId: input.messageId,
					userId: user.id,
				},
			},
		});

		if (existing) {
			if (existing.emoji === input.emoji) {
				// Same emoji — remove reaction
				await db.aiMessageReaction.delete({
					where: { id: existing.id },
				});
				return { action: "removed" as const, emoji: input.emoji };
			}
			// Different emoji — update
			await db.aiMessageReaction.update({
				where: { id: existing.id },
				data: { emoji: input.emoji },
			});
			return { action: "updated" as const, emoji: input.emoji };
		}

		await db.aiMessageReaction.create({
			data: {
				messageId: input.messageId,
				emoji: input.emoji,
				userId: user.id,
			},
		});

		return { action: "added" as const, emoji: input.emoji };
	});

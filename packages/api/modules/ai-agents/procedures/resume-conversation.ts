import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { cancelTeammateWait, queueAiChatRetry } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const resumeConversation = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/resume",
		tags: ["AI Agents"],
		summary: "Resume AI responses for a conversation after human takeover",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		const conversation = await db.aiConversation.findFirst({
			where: { id: input.conversationId },
			include: {
				agent: {
					select: { organizationId: true },
				},
				channel: {
					select: { id: true },
				},
			},
		});

		if (
			!conversation ||
			conversation.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Conversation not found",
			});
		}

		await db.aiConversation.update({
			where: { id: input.conversationId },
			data: { humanTakeoverAt: null, awaitingHumanSince: null },
		});
		await cancelTeammateWait(input.conversationId);

		// If the last message is from a user (unanswered), make the bot answer
		// it. bypassDeferral: the admin chose "let AI answer", so the teammate
		// deferral must not silence it again.
		if (conversation.channelId) {
			const lastMessage = await db.aiMessage.findFirst({
				where: { conversationId: input.conversationId },
				orderBy: { createdAt: "desc" },
				select: { role: true },
			});
			if (lastMessage?.role === "user") {
				queueAiChatRetry({
					conversationId: input.conversationId,
					channelId: conversation.channelId,
					bypassDeferral: true,
				}).catch((err) =>
					logger.error("Failed to queue AI response after resume", {
						error: err,
						conversationId: input.conversationId,
					}),
				);
			}
		}

		return { success: true };
	});

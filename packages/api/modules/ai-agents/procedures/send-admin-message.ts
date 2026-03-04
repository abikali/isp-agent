import { ORPCError } from "@orpc/server";
import type { ChannelProvider } from "@repo/ai";
import { decryptToken, sendTextMessage } from "@repo/ai";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const sendAdminMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/admin-message",
		tags: ["AI Agents"],
		summary: "Send an admin message to a conversation (human takeover)",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			message: z.string().min(1).max(4000),
			replyToId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const conversation = await db.aiConversation.findFirst({
			where: { id: input.conversationId },
			include: {
				agent: {
					select: { organizationId: true },
				},
				channel: true,
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

		const messageData: Record<string, unknown> = {
			conversationId: conversation.id,
			role: "admin",
			content: input.message,
			replyToId: input.replyToId ?? null,
		};

		// For channel conversations (WhatsApp/Telegram), send the message externally
		if (conversation.channel) {
			try {
				const apiToken = decryptToken(
					conversation.channel.encryptedApiToken,
				);
				const sendResult = await sendTextMessage(
					conversation.channel.provider as ChannelProvider,
					apiToken,
					conversation.externalChatId,
					input.message,
				);
				messageData["externalMsgId"] = sendResult.messageId ?? null;
			} catch (error) {
				logger.error("Failed to send admin message to channel", {
					error,
					conversationId: conversation.id,
					provider: conversation.channel.provider,
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to send message to channel",
				});
			}
		}

		// Store the admin message
		const msg = await db.aiMessage.create({
			data: messageData as never,
		});

		// Update conversation counters
		await db.aiConversation.update({
			where: { id: conversation.id },
			data: {
				messageCount: { increment: 1 },
				lastMessageAt: new Date(),
			},
		});

		return {
			message: {
				id: msg.id,
				role: msg.role,
				content: msg.content,
				createdAt: msg.createdAt,
			},
		};
	});

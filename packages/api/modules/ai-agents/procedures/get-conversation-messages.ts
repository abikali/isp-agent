import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getConversationMessages = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversations/{conversationId}/messages",
		tags: ["AI Agents"],
		summary: "Get messages for a conversation",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			cursor: z.string().optional(),
			limit: z.number().int().min(1).max(100).default(50),
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
				channel: {
					select: {
						id: true,
						provider: true,
						name: true,
					},
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

		const messages = await db.aiMessage.findMany({
			where: { conversationId: input.conversationId },
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			select: {
				id: true,
				role: true,
				content: true,
				externalMsgId: true,
				tokenCount: true,
				latencyMs: true,
				error: true,
				createdAt: true,
			},
			orderBy: { createdAt: "asc" },
		});

		const hasMore = messages.length > input.limit;
		const items = hasMore ? messages.slice(0, input.limit) : messages;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		return {
			conversation: {
				id: conversation.id,
				contactName: conversation.contactName,
				contactId: conversation.contactId,
				status: conversation.status,
				channel: conversation.channel,
			},
			messages: items,
			nextCursor,
		};
	});

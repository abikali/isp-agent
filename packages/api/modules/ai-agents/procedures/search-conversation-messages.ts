import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const searchConversationMessages = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversations/{conversationId}/search",
		tags: ["AI Agents"],
		summary: "Search messages within a conversation",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			query: z.string().min(1).max(200),
			limit: z.number().int().min(1).max(50).default(20),
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
			where: {
				conversationId: input.conversationId,
				content: {
					contains: input.query,
					mode: "insensitive",
				},
			},
			take: input.limit,
			select: {
				id: true,
				role: true,
				content: true,
				createdAt: true,
			},
			orderBy: { createdAt: "asc" },
		});

		return { messages };
	});

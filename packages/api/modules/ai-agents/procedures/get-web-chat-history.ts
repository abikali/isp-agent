import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { rateLimitedProcedure } from "../../../orpc/procedures";

export const getWebChatHistory = rateLimitedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/web-chat/{token}/history",
		tags: ["AI Agents"],
		summary: "Get web chat conversation history",
	})
	.input(
		z.object({
			token: z.string(),
			sessionId: z.string().uuid(),
		}),
	)
	.handler(async ({ input }) => {
		const agent = await db.aiAgent.findFirst({
			where: {
				webChatToken: input.token,
				webChatEnabled: true,
				enabled: true,
			},
			select: { id: true },
		});

		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found or not available",
			});
		}

		const conversation = await db.aiConversation.findFirst({
			where: {
				agentId: agent.id,
				channelId: null,
				externalChatId: input.sessionId,
			},
			select: { id: true },
		});

		if (!conversation) {
			return { messages: [] };
		}

		const messages = await db.aiMessage.findMany({
			where: { conversationId: conversation.id },
			orderBy: { createdAt: "asc" },
			select: {
				role: true,
				content: true,
				createdAt: true,
			},
		});

		return {
			messages: messages.map((m) => ({
				role: (m.role === "admin" ? "assistant" : m.role) as
					| "user"
					| "assistant",
				content: m.content,
				createdAt: m.createdAt.toISOString(),
			})),
		};
	});

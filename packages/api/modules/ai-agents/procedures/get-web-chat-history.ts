import { ORPCError } from "@orpc/server";
import { legacyRowToParts } from "@repo/ai";
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
				id: true,
				role: true,
				content: true,
				toolCalls: true,
				parts: true,
				createdAt: true,
			},
		});

		return {
			messages: messages.map((m) => {
				const role = (m.role === "admin" ? "assistant" : m.role) as
					| "user"
					| "assistant";
				const parts =
					Array.isArray(m.parts) && m.parts.length > 0
						? (m.parts as unknown[])
						: legacyRowToParts(m.content, m.toolCalls);
				return {
					id: m.id,
					role,
					parts,
					createdAt: m.createdAt.toISOString(),
				};
			}),
		};
	});

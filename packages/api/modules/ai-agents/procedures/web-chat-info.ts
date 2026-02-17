import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { rateLimitedProcedure } from "../../../orpc/procedures";

export const webChatInfo = rateLimitedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/web-chat/{token}",
		tags: ["AI Agents"],
		summary: "Get public AI agent info for web chat",
	})
	.input(
		z.object({
			token: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const agent = await db.aiAgent.findFirst({
			where: {
				webChatToken: input.token,
				webChatEnabled: true,
				enabled: true,
			},
			select: {
				name: true,
				greetingMessage: true,
			},
		});

		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found or not available",
			});
		}

		return {
			name: agent.name,
			greetingMessage: agent.greetingMessage,
		};
	});

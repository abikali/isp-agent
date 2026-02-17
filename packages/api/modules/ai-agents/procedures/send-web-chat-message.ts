import z from "zod";
import { rateLimitedProcedure } from "../../../orpc/procedures";
import { handleWebChatMessage } from "../lib/web-chat-handler";

export const sendWebChatMessage = rateLimitedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/web-chat/{token}",
		tags: ["AI Agents"],
		summary: "Send a message to an AI agent via web chat",
	})
	.input(
		z.object({
			token: z.string(),
			sessionId: z.string().uuid(),
			message: z.string().min(1).max(4000),
		}),
	)
	.handler(async ({ input }) => {
		return handleWebChatMessage(
			input.token,
			input.sessionId,
			input.message,
		);
	});

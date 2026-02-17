import { generateSystemPrompt as generate } from "@repo/ai";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const generateSystemPrompt = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/generate-system-prompt",
		tags: ["AI Agents"],
		summary: "Generate a system prompt using AI",
	})
	.input(
		z.object({
			organizationId: z.string(),
			enabledToolIds: z.array(z.string()),
			currentPrompt: z.string().optional(),
			agentName: z.string().optional(),
			agentDescription: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const systemPrompt = await generate({
			enabledToolIds: input.enabledToolIds,
			currentPrompt: input.currentPrompt,
			agentName: input.agentName,
			agentDescription: input.agentDescription,
		});

		return { systemPrompt };
	});

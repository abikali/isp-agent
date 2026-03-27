import { getAvailableTools } from "@repo/ai";
import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listTools = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/tools",
		tags: ["AI Agents"],
		summary: "List available AI agent tools",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		const tools = getAvailableTools();
		return { tools };
	});

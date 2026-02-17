import { getAvailableTools } from "@repo/ai";
import { protectedProcedure } from "../../../orpc/procedures";

export const listTools = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/tools",
		tags: ["AI Agents"],
		summary: "List available AI agent tools",
	})
	.handler(async () => {
		const tools = getAvailableTools();
		return { tools };
	});

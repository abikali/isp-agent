import { ORPCError } from "@orpc/server";
import { isValidToolId } from "@repo/ai";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateToolConfig = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}/tools/{toolId}/config",
		tags: ["AI Agents"],
		summary: "Update tool configuration for an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			toolId: z.string(),
			config: z.record(z.string(), z.unknown()),
			promptSection: z.string().max(10000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		if (!isValidToolId(input.toolId)) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Invalid tool ID: ${input.toolId}`,
			});
		}

		const agent = await db.aiAgent.findFirst({
			where: {
				id: input.agentId,
				organizationId: input.organizationId,
			},
		});
		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		// Serialize config to ensure Prisma-compatible JSON
		const configJson = JSON.parse(JSON.stringify(input.config));

		const promptSection =
			input.promptSection !== undefined
				? input.promptSection || null
				: undefined;

		const toolConfig = await db.aiAgentToolConfig.upsert({
			where: {
				agentId_toolId: {
					agentId: input.agentId,
					toolId: input.toolId,
				},
			},
			create: {
				agentId: input.agentId,
				toolId: input.toolId,
				config: configJson,
				promptSection: promptSection ?? null,
			},
			update: {
				config: configJson,
				...(promptSection !== undefined ? { promptSection } : {}),
			},
		});

		return { toolConfig };
	});

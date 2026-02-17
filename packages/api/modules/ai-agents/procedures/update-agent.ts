import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { aiAgentAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateAgent = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}",
		tags: ["AI Agents"],
		summary: "Update an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().max(500).optional(),
			systemPrompt: z.string().min(1).max(10000).optional(),
			greetingMessage: z.string().max(1000).optional(),
			model: z.string().optional(),
			knowledgeBase: z.string().max(50000).optional(),
			enabled: z.boolean().optional(),
			maxHistoryLength: z.number().int().min(1).max(50).optional(),
			temperature: z.number().min(0).max(2).optional(),
			enabledTools: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can update AI agents",
			});
		}

		const existing = await db.aiAgent.findFirst({
			where: { id: input.agentId, organizationId: input.organizationId },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		const { agentId, organizationId, ...rest } = input;

		// Build update data, converting undefined optional fields to null for Prisma
		const updateData: Record<string, unknown> = {};
		if (rest.name !== undefined) {
			updateData["name"] = rest.name;
		}
		if (rest.description !== undefined) {
			updateData["description"] = rest.description ?? null;
		}
		if (rest.systemPrompt !== undefined) {
			updateData["systemPrompt"] = rest.systemPrompt;
		}
		if (rest.greetingMessage !== undefined) {
			updateData["greetingMessage"] = rest.greetingMessage ?? null;
		}
		if (rest.model !== undefined) {
			updateData["model"] = rest.model;
		}
		if (rest.knowledgeBase !== undefined) {
			updateData["knowledgeBase"] = rest.knowledgeBase ?? null;
		}
		if (rest.enabled !== undefined) {
			updateData["enabled"] = rest.enabled;
		}
		if (rest.maxHistoryLength !== undefined) {
			updateData["maxHistoryLength"] = rest.maxHistoryLength;
		}
		if (rest.temperature !== undefined) {
			updateData["temperature"] = rest.temperature;
		}
		if (rest.enabledTools !== undefined) {
			updateData["enabledTools"] = rest.enabledTools;
		}

		const agent = await db.aiAgent.update({
			where: { id: agentId },
			data: updateData,
			select: {
				id: true,
				name: true,
				description: true,
				systemPrompt: true,
				greetingMessage: true,
				model: true,
				knowledgeBase: true,
				enabled: true,
				maxHistoryLength: true,
				temperature: true,
				enabledTools: true,
				updatedAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		aiAgentAudit.updated(agentId, user.id, organizationId, auditContext);

		return { agent };
	});

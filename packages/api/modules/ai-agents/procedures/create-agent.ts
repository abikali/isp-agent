import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { aiAgentAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createAgent = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents",
		tags: ["AI Agents"],
		summary: "Create a new AI agent",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			description: z.string().max(500).optional(),
			systemPrompt: z.string().min(1).max(10000),
			greetingMessage: z.string().max(1000).optional(),
			model: z.string().default("gpt-4o-mini"),
			knowledgeBase: z.string().max(50000).optional(),
			maxHistoryLength: z.number().int().min(1).max(50).default(20),
			temperature: z.number().min(0).max(2).default(0.7),
			enabledTools: z.array(z.string()).default([]),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can create AI agents",
			});
		}

		const agent = await db.aiAgent.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				description: input.description ?? null,
				systemPrompt: input.systemPrompt,
				greetingMessage: input.greetingMessage ?? null,
				model: input.model,
				knowledgeBase: input.knowledgeBase ?? null,
				maxHistoryLength: input.maxHistoryLength,
				temperature: input.temperature,
				enabledTools: input.enabledTools,
				createdById: user.id,
			},
			select: {
				id: true,
				name: true,
				description: true,
				model: true,
				enabled: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		aiAgentAudit.created(
			agent.id,
			user.id,
			input.organizationId,
			auditContext,
			{
				name: input.name,
				model: input.model,
			},
		);

		return { agent };
	});

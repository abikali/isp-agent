import { ORPCError } from "@orpc/server";
import {
	AI_PROVIDERS,
	isModelAvailable,
	resolveAgentCredentials,
	testModelCredentials,
} from "@repo/ai";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * One tiny generation with the key typed in the form (not saved yet) or,
 * when none is typed, the agent's stored key — so a bad key is caught
 * before it silences the agent.
 */
export const testAgentApiKey = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}/test-api-key",
		tags: ["AI Agents"],
		summary: "Test an AI agent's provider API key",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			provider: z.enum(AI_PROVIDERS),
			model: z.string(),
			apiKey: z.string().trim().min(8).max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		if (!isModelAvailable(input.model, input.provider)) {
			return {
				ok: false as const,
				error: `${input.model} is not available from ${input.provider}`,
			};
		}
		let apiKey = input.apiKey;
		if (!apiKey) {
			const agent = await db.aiAgent.findFirst({
				where: {
					id: input.agentId,
					organizationId: input.organizationId,
				},
				select: { provider: true, encryptedApiKey: true },
			});
			if (!agent) {
				throw new ORPCError("NOT_FOUND", {
					message: "Agent not found",
				});
			}
			if (!agent.encryptedApiKey || agent.provider !== input.provider) {
				return {
					ok: false as const,
					error: `Enter the ${input.provider} API key to test it`,
				};
			}
			apiKey = resolveAgentCredentials(agent).apiKey;
		}
		return testModelCredentials(input.model, {
			provider: input.provider,
			apiKey,
		});
	});

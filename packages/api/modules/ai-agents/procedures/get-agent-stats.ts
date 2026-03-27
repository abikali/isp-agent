import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getAgentStats = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/{agentId}/stats",
		tags: ["AI Agents"],
		summary: "Get agent statistics",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			period: z.enum(["7d", "30d", "90d"]).default("30d"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

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

		const days =
			input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
		const since = new Date();
		since.setDate(since.getDate() - days);

		const [messageStats, conversationCount, totalConversations] =
			await Promise.all([
				db.aiMessage.aggregate({
					where: {
						conversation: { agentId: input.agentId },
						createdAt: { gte: since },
					},
					_count: true,
					_sum: { tokenCount: true },
					_avg: { latencyMs: true },
				}),
				db.aiConversation.count({
					where: {
						agentId: input.agentId,
						createdAt: { gte: since },
					},
				}),
				db.aiConversation.count({
					where: { agentId: input.agentId },
				}),
			]);

		return {
			stats: {
				period: input.period,
				totalMessages: messageStats._count,
				totalTokens: messageStats._sum.tokenCount ?? 0,
				avgLatencyMs: Math.round(messageStats._avg.latencyMs ?? 0),
				conversationsInPeriod: conversationCount,
				totalConversations,
			},
		};
	});

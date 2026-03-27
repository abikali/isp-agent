import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { getBaseUrl } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listChannels = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/{agentId}/channels",
		tags: ["AI Agents"],
		summary: "List channels for an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
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

		const channels = await db.aiAgentChannel.findMany({
			where: { agentId: input.agentId },
			select: {
				id: true,
				provider: true,
				name: true,
				webhookToken: true,
				enabled: true,
				lastActivityAt: true,
				createdAt: true,
				_count: {
					select: { conversations: true },
				},
			},
			orderBy: { createdAt: "desc" },
		});

		const baseUrl = getBaseUrl();
		const channelsWithUrls = channels.map((ch) => ({
			...ch,
			webhookUrl: `${baseUrl}/api/webhooks/chat/${ch.provider}/${ch.webhookToken}`,
		}));

		return { channels: channelsWithUrls };
	});

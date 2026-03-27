import { ORPCError } from "@orpc/server";
import { encryptToken } from "@repo/ai";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateChannel = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/channels/{channelId}",
		tags: ["AI Agents"],
		summary: "Update a channel",
	})
	.input(
		z.object({
			channelId: z.string(),
			organizationId: z.string(),
			name: z.string().min(1).max(100).optional(),
			apiToken: z.string().min(1).optional(),
			enabled: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		const existing = await db.aiAgentChannel.findFirst({
			where: { id: input.channelId },
			include: {
				agent: {
					select: { organizationId: true },
				},
			},
		});
		if (
			!existing ||
			existing.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Channel not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.enabled !== undefined) {
			updateData["enabled"] = input.enabled;
		}
		if (input.apiToken !== undefined) {
			updateData["encryptedApiToken"] = encryptToken(input.apiToken);
		}

		const channel = await db.aiAgentChannel.update({
			where: { id: input.channelId },
			data: updateData,
			select: {
				id: true,
				provider: true,
				name: true,
				enabled: true,
				updatedAt: true,
			},
		});

		return { channel };
	});

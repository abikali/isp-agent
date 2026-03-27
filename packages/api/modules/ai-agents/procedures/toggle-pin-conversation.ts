import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const togglePinConversation = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/pin",
		tags: ["AI Agents"],
		summary: "Toggle pin status of a conversation",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			pinned: z.boolean(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		const conversation = await db.aiConversation.findFirst({
			where: { id: input.conversationId },
			include: {
				agent: {
					select: { organizationId: true },
				},
			},
		});

		if (
			!conversation ||
			conversation.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Conversation not found",
			});
		}

		await db.aiConversation.update({
			where: { id: input.conversationId },
			data: { pinned: input.pinned },
		});

		return { success: true };
	});

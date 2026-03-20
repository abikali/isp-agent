import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const resumeConversation = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/resume",
		tags: ["AI Agents"],
		summary: "Resume AI responses for a conversation after human takeover",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

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
			data: { humanTakeoverAt: null },
		});

		return { success: true };
	});

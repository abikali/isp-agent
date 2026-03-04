import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/messages/{messageId}/delete",
		tags: ["AI Agents"],
		summary: "Soft-delete a message (admin only)",
	})
	.input(
		z.object({
			messageId: z.string(),
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

		const message = await db.aiMessage.findFirst({
			where: { id: input.messageId },
			include: {
				conversation: {
					include: {
						agent: { select: { organizationId: true } },
					},
				},
			},
		});

		if (
			!message ||
			message.conversation.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Message not found",
			});
		}

		await db.aiMessage.update({
			where: { id: input.messageId },
			data: { deletedAt: new Date() },
		});

		return { success: true };
	});

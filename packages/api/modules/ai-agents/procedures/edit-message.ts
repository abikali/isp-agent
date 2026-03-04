import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const editMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/messages/{messageId}/edit",
		tags: ["AI Agents"],
		summary: "Edit a message (admin only)",
	})
	.input(
		z.object({
			messageId: z.string(),
			organizationId: z.string(),
			content: z.string().min(1).max(4000),
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

		// Only admin messages can be edited by admin
		if (message.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Only admin messages can be edited",
			});
		}

		const updated = await db.aiMessage.update({
			where: { id: input.messageId },
			data: {
				content: input.content,
				editedAt: new Date(),
			},
		});

		return {
			message: {
				id: updated.id,
				content: updated.content,
				editedAt: updated.editedAt,
			},
		};
	});

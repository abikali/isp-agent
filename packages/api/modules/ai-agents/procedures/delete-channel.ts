import { ORPCError } from "@orpc/server";
import { decryptToken, telegram } from "@repo/ai";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	aiChannelAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteChannel = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/channels/{channelId}/delete",
		tags: ["AI Agents"],
		summary: "Delete a channel",
	})
	.input(
		z.object({
			channelId: z.string(),
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can delete channels",
			});
		}

		const channel = await db.aiAgentChannel.findFirst({
			where: { id: input.channelId },
			include: {
				agent: {
					select: { organizationId: true },
				},
			},
		});
		if (!channel || channel.agent.organizationId !== input.organizationId) {
			throw new ORPCError("NOT_FOUND", {
				message: "Channel not found",
			});
		}

		// For Telegram, remove the webhook registration
		if (channel.provider === "telegram") {
			try {
				const apiToken = decryptToken(channel.encryptedApiToken);
				await telegram.deleteWebhook(apiToken);
			} catch {
				// Best-effort cleanup, don't block deletion
			}
		}

		await db.aiAgentChannel.delete({
			where: { id: input.channelId },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		aiChannelAudit.deleted(
			input.channelId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});

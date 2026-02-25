import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { encryptToken, telegram, whatsapp } from "@repo/ai";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	aiChannelAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { getBaseUrl } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createChannel = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}/channels",
		tags: ["AI Agents"],
		summary: "Create a channel for an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			provider: z.enum(["whatsapp", "telegram"]),
			name: z.string().min(1).max(100),
			apiToken: z.string().min(1),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can create channels",
			});
		}

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

		const webhookToken = randomBytes(32).toString("hex");
		const encryptedApiToken = encryptToken(input.apiToken);

		// For Telegram, generate a secret for webhook verification
		let webhookSecret: string | null = null;
		if (input.provider === "telegram") {
			webhookSecret = randomBytes(32).toString("hex");
		}

		const channel = await db.aiAgentChannel.create({
			data: {
				agentId: input.agentId,
				provider: input.provider,
				name: input.name,
				webhookToken,
				webhookSecret,
				encryptedApiToken,
			},
			select: {
				id: true,
				provider: true,
				name: true,
				webhookToken: true,
				enabled: true,
				createdAt: true,
			},
		});

		// For Telegram, register the webhook with Telegram API
		if (input.provider === "telegram" && webhookSecret) {
			const webhookUrl = `${getBaseUrl()}/api/webhooks/chat/telegram/${webhookToken}`;
			const success = await telegram.setWebhook(
				input.apiToken,
				webhookUrl,
				webhookSecret,
			);
			if (!success) {
				await db.aiAgentChannel.delete({ where: { id: channel.id } });
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Failed to register Telegram webhook. Check your bot token.",
				});
			}
		}

		// For WhatsApp, register the webhook with Whapi API
		if (input.provider === "whatsapp") {
			const whatsappWebhookUrl = `${getBaseUrl()}/api/webhooks/chat/whatsapp/${webhookToken}`;
			const success = await whatsapp.setWebhook(
				input.apiToken,
				whatsappWebhookUrl,
			);
			if (!success) {
				await db.aiAgentChannel.delete({ where: { id: channel.id } });
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Failed to register WhatsApp webhook. Check your API token.",
				});
			}
		}

		const baseUrl = getBaseUrl();
		const webhookUrl =
			input.provider === "whatsapp"
				? `${baseUrl}/api/webhooks/chat/whatsapp/${webhookToken}`
				: `${baseUrl}/api/webhooks/chat/telegram/${webhookToken}`;

		const auditContext = getAuditContextFromHeaders(headers);
		aiChannelAudit.created(
			channel.id,
			user.id,
			input.organizationId,
			auditContext,
			{
				provider: input.provider,
				name: input.name,
			},
		);

		return { channel, webhookUrl };
	});

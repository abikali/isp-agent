import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { normalizePhone } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Find or create a WhatsApp conversation for the given phone number so
 * operators can jump straight into a chat from other parts of the app
 * (billing, customers, etc.).
 *
 * Picks the organization's first enabled WhatsApp channel. Matches any
 * existing active conversation whose externalChatId starts with the
 * normalized digits — WhatsApp chat ids are `{digits}@s.whatsapp.net` but
 * some providers use `@c.us`, so we match on the digit prefix.
 */
export const openConversationByPhone = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/open-by-phone",
		tags: ["AI Agents"],
		summary:
			"Find or create an active WhatsApp conversation for a phone number",
	})
	.input(
		z.object({
			organizationId: z.string(),
			phone: z.string().min(6),
			contactName: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		const digits = normalizePhone(input.phone);
		if (!digits) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Invalid phone number",
			});
		}

		const channel = await db.aiAgentChannel.findFirst({
			where: {
				provider: "whatsapp",
				enabled: true,
				agent: { organizationId: input.organizationId },
			},
			orderBy: { lastActivityAt: "desc" },
			select: { id: true, agentId: true },
		});
		if (!channel) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No WhatsApp channel configured for this organization",
			});
		}

		const existing = await db.aiConversation.findFirst({
			where: {
				channelId: channel.id,
				status: "active",
				externalChatId: { startsWith: `${digits}@` },
			},
			orderBy: { lastMessageAt: "desc" },
			select: { id: true },
		});
		if (existing) {
			return { conversationId: existing.id, created: false };
		}

		const created = await db.aiConversation.create({
			data: {
				agentId: channel.agentId,
				channelId: channel.id,
				externalChatId: `${digits}@s.whatsapp.net`,
				contactName: input.contactName ?? null,
				lastMessageAt: new Date(),
			},
			select: { id: true },
		});
		return { conversationId: created.id, created: true };
	});

import { ORPCError } from "@orpc/server";
import { legacyRowToParts } from "@repo/ai";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, normalizeLebanesePhone } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getConversationMessages = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversations/{conversationId}/messages",
		tags: ["AI Agents"],
		summary: "Get messages for a conversation",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			cursor: z.string().optional(),
			limit: z.number().int().min(1).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		const conversation = await db.aiConversation.findFirst({
			where: { id: input.conversationId },
			include: {
				agent: {
					select: { organizationId: true, humanTakeoverHours: true },
				},
				channel: {
					select: {
						id: true,
						provider: true,
						name: true,
					},
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

		// Newest-first pagination: the first page is the latest messages and
		// the cursor walks backwards through history (for lazy loading older
		// messages on scroll-up). Pages are returned newest-first; the client
		// reverses for display.
		const messages = await db.aiMessage.findMany({
			where: { conversationId: input.conversationId },
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			select: {
				id: true,
				role: true,
				content: true,
				externalMsgId: true,
				tokenCount: true,
				latencyMs: true,
				error: true,
				parts: true,
				toolCalls: true,
				replyToId: true,
				deliveryStatus: true,
				editedAt: true,
				deletedAt: true,
				attachmentType: true,
				attachmentUrl: true,
				attachmentFilename: true,
				attachmentMimeType: true,
				attachmentSize: true,
				attachmentMeta: true,
				createdAt: true,
				replyTo: {
					select: {
						id: true,
						role: true,
						content: true,
					},
				},
				reactions: {
					select: {
						id: true,
						emoji: true,
						userId: true,
						contactId: true,
					},
				},
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		});

		// Replace deleted message content
		for (const msg of messages) {
			if (msg.deletedAt) {
				msg.content = "This message was deleted";
			}
		}

		const hasMore = messages.length > input.limit;
		const items = hasMore ? messages.slice(0, input.limit) : messages;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		// Canonical UIMessage parts for every row. Legacy rows (no `parts`
		// column populated) are synthesised from `content + toolCalls` so the
		// dashboard's MessageBubble receives one consistent shape.
		const itemsWithParts = items.map((m) => {
			const partsSource =
				Array.isArray(m.parts) && m.parts.length > 0
					? m.parts
					: legacyRowToParts(m.content, m.toolCalls);
			const { toolCalls: _legacy, parts: _stored, ...rest } = m;
			return { ...rest, parts: partsSource };
		});

		// Compute takeover expiry: null if not active or expired
		let humanTakeoverExpiresAt: Date | null = null;
		if (
			conversation.humanTakeoverAt &&
			conversation.agent.humanTakeoverHours
		) {
			const expiresAt = new Date(
				conversation.humanTakeoverAt.getTime() +
					conversation.agent.humanTakeoverHours * 60 * 60 * 1000,
			);
			if (expiresAt > new Date()) {
				humanTakeoverExpiresAt = expiresAt;
			}
		}

		// Resolve linked customers (for username display) via phone match.
		// Customer.mobile is stored normalized (+961...) so we normalize contactId
		// the same way before the lookup. Multiple customers may share one phone.
		let customers: Array<{
			id: string;
			username: string | null;
			accountNumber: string;
		}> = [];
		if (conversation.contactId) {
			const normalized = normalizeLebanesePhone(conversation.contactId);
			// Conversations are org-shared (no dealer column on the AI agent),
			// but the customer enrichment has to honour dealer scope so the
			// resolved customer never crosses the active-dealer boundary.
			customers = await db.customer.findMany({
				where: {
					organizationId: input.organizationId,
					mobile: normalized,
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true, username: true, accountNumber: true },
			});
		}

		return {
			conversation: {
				id: conversation.id,
				contactName: conversation.contactName,
				contactId: conversation.contactId,
				status: conversation.status,
				humanTakeoverAt: conversation.humanTakeoverAt,
				humanTakeoverExpiresAt,
				channel: conversation.channel,
				customers,
			},
			messages: itemsWithParts,
			nextCursor,
		};
	});

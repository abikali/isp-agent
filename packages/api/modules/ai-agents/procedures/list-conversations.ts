import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listConversations = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/{agentId}/conversations",
		tags: ["AI Agents"],
		summary: "List conversations for an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			channelId: z.string().optional(),
			status: z.enum(["active", "archived"]).optional(),
			cursor: z.string().optional(),
			limit: z.number().int().min(1).max(50).default(20),
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

		const where: Record<string, unknown> = {
			agentId: input.agentId,
		};
		if (input.channelId) {
			where["channelId"] = input.channelId;
		}
		if (input.status) {
			where["status"] = input.status;
		}

		const conversations = await db.aiConversation.findMany({
			where,
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			select: {
				id: true,
				externalChatId: true,
				contactName: true,
				contactId: true,
				status: true,
				messageCount: true,
				lastMessageAt: true,
				createdAt: true,
				channel: {
					select: {
						id: true,
						provider: true,
						name: true,
					},
				},
				messages: {
					select: {
						content: true,
						role: true,
						createdAt: true,
					},
					orderBy: { createdAt: "desc" },
					take: 1,
				},
			},
			orderBy: { lastMessageAt: "desc" },
		});

		const hasMore = conversations.length > input.limit;
		const items = hasMore
			? conversations.slice(0, input.limit)
			: conversations;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		return {
			conversations: items.map((c) => ({
				...c,
				lastMessage: c.messages[0] ?? null,
				messages: undefined,
			})),
			nextCursor,
		};
	});

import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listAllConversations = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversations/all",
		tags: ["AI Agents"],
		summary: "List conversations across all agents for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			agentId: z.string().optional(),
			search: z.string().optional(),
			channelType: z.enum(["web", "whatsapp", "telegram"]).optional(),
			status: z.enum(["active", "archived"]).optional(),
			pinned: z.boolean().optional(),
			sortBy: z
				.enum(["lastMessageAt", "messageCount", "createdAt"])
				.default("lastMessageAt"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
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

		const where: Record<string, unknown> = {
			agent: { organizationId: input.organizationId },
		};

		if (input.agentId) {
			where["agentId"] = input.agentId;
		}

		if (input.search) {
			where["contactName"] = {
				contains: input.search,
				mode: "insensitive",
			};
		}

		if (input.channelType === "web") {
			where["channelId"] = null;
		} else if (input.channelType) {
			where["channel"] = { provider: input.channelType };
		}

		if (input.status) {
			where["status"] = input.status;
		}

		if (input.pinned !== undefined) {
			where["pinned"] = input.pinned;
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
				pinned: true,
				messageCount: true,
				lastMessageAt: true,
				createdAt: true,
				agent: {
					select: {
						id: true,
						name: true,
					},
				},
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
			orderBy: { [input.sortBy]: input.sortOrder },
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

import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Episode summaries of bot conversations ("what the bot said and what was
 * concluded"), for the conversation page and the customer's Bot tab.
 */
export const listConversationSummaries = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversation-summaries",
		tags: ["AI Agents"],
		summary: "List conversation summaries",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				conversationId: z.string().optional(),
				customerId: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(30),
			})
			.refine((v) => v.conversationId || v.customerId, {
				message: "conversationId or customerId is required",
			}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);
		if (activeDealerId && input.customerId) {
			const customer = await db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					dealerId: activeDealerId,
				},
				select: { id: true },
			});
			if (!customer) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer not found",
				});
			}
		}
		const summaries = await db.aiConversationSummary.findMany({
			where: {
				organizationId: input.organizationId,
				...(input.conversationId
					? { conversationId: input.conversationId }
					: {}),
				...(input.customerId ? { customerId: input.customerId } : {}),
			},
			orderBy: { toAt: "desc" },
			take: input.limit,
			select: {
				id: true,
				conversationId: true,
				customerId: true,
				fromAt: true,
				toAt: true,
				userMessages: true,
				botMessages: true,
				adminMessages: true,
				outcome: true,
				customerMood: true,
				summary: true,
				botActions: true,
				openItems: true,
				taskId: true,
				telegramSentAt: true,
				createdAt: true,
			},
		});
		return { summaries };
	});

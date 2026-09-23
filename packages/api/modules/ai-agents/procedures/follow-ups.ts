import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import {
	cancelFollowUp,
	countRecentFollowUps,
	draftFollowUp,
	runFollowUp,
} from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const conversationInput = z.object({
	conversationId: z.string(),
	organizationId: z.string(),
});

async function findConversation(
	conversationId: string,
	organizationId: string,
) {
	const conversation = await db.aiConversation.findFirst({
		where: { id: conversationId, agent: { organizationId } },
		select: {
			id: true,
			channelId: true,
			externalChatId: true,
			followUpDueAt: true,
			followUpAttempts: true,
			followUpMuted: true,
			followUpSentAt: true,
			followUpOutcome: true,
			followUpOutcomeAt: true,
			agent: {
				select: {
					followUpMinutes: true,
					followUpMaxAttempts: true,
					followUpWeeklyCap: true,
					followUpWindowStart: true,
					followUpWindowEnd: true,
				},
			},
		},
	});
	if (!conversation) {
		throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
	}
	return conversation;
}

/** Everything the conversation panel shows about the follow-up. */
export const getConversationFollowUp = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/conversations/{conversationId}/follow-up",
		tags: ["AI Agents"],
		summary: "Follow-up status of a conversation",
	})
	.input(conversationInput)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);
		const conversation = await findConversation(
			input.conversationId,
			input.organizationId,
		);
		const sentThisWeek = await countRecentFollowUps(conversation);
		const { agent, ...state } = conversation;
		return {
			...state,
			enabled: agent.followUpMinutes != null,
			maxAttempts: agent.followUpMaxAttempts,
			weeklyCap: agent.followUpWeeklyCap,
			window: {
				start: agent.followUpWindowStart,
				end: agent.followUpWindowEnd,
			},
			sentThisWeek,
		};
	});

/**
 * Generate what the next nudge would say. Cached against the conversation's
 * last activity: if nothing changes, the scheduled nudge sends this text.
 */
export const previewFollowUp = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/follow-up/preview",
		tags: ["AI Agents"],
		summary: "Preview the next follow-up message",
	})
	.input(conversationInput)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);
		await findConversation(input.conversationId, input.organizationId);
		try {
			return await draftFollowUp(input.conversationId);
		} catch (error) {
			logger.warn("[ai-followup] preview failed", {
				conversationId: input.conversationId,
				error: String(error),
			});
			throw new ORPCError("BAD_GATEWAY", {
				message:
					error instanceof Error
						? error.message
						: "Could not generate a preview",
			});
		}
	});

/** Admin override: send the nudge now, outside the window and caps. */
export const sendFollowUpNow = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/follow-up/send",
		tags: ["AI Agents"],
		summary: "Send the follow-up now",
	})
	.input(conversationInput)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		await findConversation(input.conversationId, input.organizationId);
		await cancelFollowUp(input.conversationId);
		return runFollowUp({
			conversationId: input.conversationId,
			repliedAt: null,
			force: true,
		});
	});

export const cancelConversationFollowUp = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/follow-up/cancel",
		tags: ["AI Agents"],
		summary: "Cancel the queued follow-up",
	})
	.input(conversationInput)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		await findConversation(input.conversationId, input.organizationId);
		await cancelFollowUp(input.conversationId);
		await db.aiConversation.update({
			where: { id: input.conversationId },
			data: {
				followUpOutcome: "cancelled",
				followUpOutcomeAt: new Date(),
			},
		});
		return { success: true };
	});

/** Never nudge this chat again (until unmuted). Cancels a queued nudge. */
export const setFollowUpMuted = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/follow-up/mute",
		tags: ["AI Agents"],
		summary: "Mute or unmute follow-ups for a conversation",
	})
	.input(conversationInput.extend({ muted: z.boolean() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		await findConversation(input.conversationId, input.organizationId);
		if (input.muted) {
			await cancelFollowUp(input.conversationId);
		}
		await db.aiConversation.update({
			where: { id: input.conversationId },
			data: { followUpMuted: input.muted },
		});
		return { success: true };
	});

const WEEK_MS = 7 * 24 * 60 * 60_000;
/** A reply this soon after a nudge counts as an answer to it. */
const ANSWER_WINDOW_MS = 24 * 60 * 60_000;

/** Agent-level numbers for the follow-up settings card. */
export const getFollowUpStats = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/{agentId}/follow-up-stats",
		tags: ["AI Agents"],
		summary: "Follow-up activity for an agent",
	})
	.input(z.object({ agentId: z.string(), organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);
		const agent = {
			agentId: input.agentId,
			agent: { organizationId: input.organizationId },
		};
		const since = new Date(Date.now() - WEEK_MS);
		const [queued, nudges] = await Promise.all([
			db.aiConversation.count({
				where: { ...agent, followUpDueAt: { not: null } },
			}),
			db.aiMessage.findMany({
				where: {
					isFollowUp: true,
					createdAt: { gte: since },
					conversation: agent,
				},
				select: { conversationId: true, createdAt: true },
			}),
		]);
		// Answered = the customer wrote within 24h of the nudge.
		const replies = await db.aiMessage.findMany({
			where: {
				role: "user",
				createdAt: { gte: since },
				conversationId: {
					in: [...new Set(nudges.map((n) => n.conversationId))],
				},
			},
			select: { conversationId: true, createdAt: true },
		});
		const answered = nudges.filter((nudge) =>
			replies.some(
				(r) =>
					r.conversationId === nudge.conversationId &&
					r.createdAt > nudge.createdAt &&
					r.createdAt.getTime() - nudge.createdAt.getTime() <=
						ANSWER_WINDOW_MS,
			),
		).length;
		return {
			queued,
			sentThisWeek: nudges.length,
			answeredThisWeek: answered,
		};
	});

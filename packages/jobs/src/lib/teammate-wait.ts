import {
	resolveAgentCredentials,
	resolveAgentTools,
	teammateActionNeeded,
	teammateWaitAlertEnabled,
} from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { beirutParts } from "@repo/utils";
import { queueAiChatRetry } from "../jobs/ai-chat.jobs";
import {
	clearAwaitingHuman,
	scheduleTeammateWait,
	TEAMMATE_BOT_TAKEOVER_AFTER_MS,
} from "../jobs/ai-teammate-wait.jobs";
import type { AiChatJobData, AiChatJobResult } from "../types";

/**
 * When the bot takes over a chat a teammate left unanswered: 30 min after
 * the customer started waiting, but never while a human takeover is still
 * active (that waits for the takeover to expire).
 */
export function teammateReplyFireAt(
	awaitingSince: Date,
	takeoverExpiresAt: Date | null,
): Date {
	const afterWait = awaitingSince.getTime() + TEAMMATE_BOT_TAKEOVER_AFTER_MS;
	return new Date(Math.max(afterWait, takeoverExpiresAt?.getTime() ?? 0));
}

function takeoverExpiry(
	humanTakeoverAt: Date | null,
	humanTakeoverHours: number | null,
): Date | null {
	if (!humanTakeoverAt || !humanTakeoverHours) {
		return null;
	}
	return new Date(humanTakeoverAt.getTime() + humanTakeoverHours * 3_600_000);
}

function formatBeirutTime(value: Date): string {
	const { hour, minute } = beirutParts(value);
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * One step of the wait for a teammate's reply (see `markAwaitingHuman`).
 *
 * - `alert` (+20 min): if nobody answered, queue `reply` — and, when the
 *   agent has the teammate-wait alert switched on, tell the team on Telegram
 *   and file the AI_ESCALATION task. Messages held during a takeover were
 *   never classified, so a pure acknowledgement ends the wait here.
 * - `reply` (+30 min, after any takeover): if still nobody answered, the bot
 *   answers what it can, told that the team was already alerted.
 */
export async function handleTeammateWait(
	data: AiChatJobData,
): Promise<AiChatJobResult> {
	const { conversationId } = data;
	const stage = data.stage ?? "alert";

	const conversation = await loadConversation(conversationId);
	const since = conversation?.awaitingHumanSince;
	if (!conversation || !since || conversation.status !== "active") {
		return { success: true, error: "Not waiting for a teammate" };
	}

	const answered = await db.aiMessage.findFirst({
		where: {
			conversationId,
			role: { in: ["admin", "assistant"] },
			createdAt: { gt: since },
		},
		select: { id: true },
	});
	if (answered) {
		await clearAwaitingHuman(conversationId);
		return { success: true, error: "Already answered" };
	}

	const channelId = conversation.channelId ?? data.channelId;
	const { agent } = conversation;
	if (!agent.encryptedApiKey) {
		return { success: false, error: "Agent has no API key" };
	}
	const credentials = resolveAgentCredentials(agent);
	const minutesWaiting = Math.round((Date.now() - since.getTime()) / 60_000);

	if (stage === "reply") {
		logger.info("ai-awaiting-human-bot-reply", {
			conversationId,
			minutesWaiting,
		});
		await queueAiChatRetry({
			conversationId,
			channelId,
			bypassDeferral: true,
			contextNotice: "awaiting-teammate",
		});
		return { success: true };
	}

	if (
		data.origin === "takeover" &&
		!(await teammateActionNeeded({ conversationId, credentials }))
	) {
		logger.info("ai-awaiting-human-no-action", { conversationId });
		await clearAwaitingHuman(conversationId);
		return { success: true, error: "Nothing to act on" };
	}

	if (await teammateWaitAlertEnabled(agent.id)) {
		await alertTeam({ conversation, credentials, since, minutesWaiting });
	}

	await scheduleTeammateWait({
		conversationId,
		channelId,
		stage: "reply",
		origin: data.origin ?? "deferral",
		fireAt: teammateReplyFireAt(
			since,
			takeoverExpiry(
				conversation.humanTakeoverAt,
				agent.humanTakeoverHours,
			),
		),
	});
	return { success: true };
}

type WaitingConversation = NonNullable<
	Awaited<ReturnType<typeof loadConversation>>
>;

function loadConversation(conversationId: string) {
	return db.aiConversation.findUnique({
		where: { id: conversationId },
		include: { agent: true },
	});
}

/** Tell the team on Telegram that a customer is waiting on a teammate. */
async function alertTeam(input: {
	conversation: WaitingConversation;
	credentials: ReturnType<typeof resolveAgentCredentials>;
	since: Date;
	minutesWaiting: number;
}): Promise<void> {
	const { conversation, credentials, since, minutesWaiting } = input;
	const conversationId = conversation.id;
	const { agent } = conversation;
	const [customerMessages, teammate] = await Promise.all([
		db.aiMessage.findMany({
			where: { conversationId, role: "user", createdAt: { gte: since } },
			orderBy: { createdAt: "desc" },
			select: { content: true },
		}),
		db.aiMessage.findFirst({
			where: { conversationId, role: "admin" },
			orderBy: { createdAt: "desc" },
			select: { createdAt: true },
		}),
	]);

	const { tools } = await resolveAgentTools({
		credentials,
		agent,
		// The alert is about a human's silence, not a diagnosis: send it
		// even during maintenance.
		maintenanceActive: false,
		conversationId,
		externalChatId: conversation.externalChatId,
		contactName: conversation.contactName ?? undefined,
		contactPhone: conversation.contactId ?? undefined,
	});
	const escalate = tools?.["escalate-telegram"];
	if (escalate?.execute) {
		const contact =
			conversation.contactName ??
			conversation.contactId ??
			"The customer";
		const lastThree = customerMessages
			.slice(0, 3)
			.reverse()
			.map((m) => m.content.slice(0, 200))
			.join("\n");
		const teammateAt = teammate
			? `the teammate's message at ${formatBeirutTime(teammate.createdAt)} Beirut time`
			: "a teammate's message";
		try {
			await escalate.execute(
				{
					reason: "Customer waiting for a teammate reply",
					priority: "medium",
					category: "support",
					customerName: conversation.contactName ?? undefined,
					summary: `${contact} wrote ${customerMessages.length} message(s) after ${teammateAt}; the bot stayed silent because a teammate was handling the chat, and nobody has replied for ${minutesWaiting} min. Messages:\n${lastThree}`,
					actionRequired:
						"Reply in the conversation, or press 'Let AI answer' in the dashboard.",
				},
				{
					toolCallId: `awaiting-${conversationId}`,
					messages: [],
					abortSignal: AbortSignal.timeout(30_000),
				},
			);
			logger.info("ai-awaiting-human-alerted", {
				conversationId,
				minutesWaiting,
			});
		} catch (error) {
			logger.error("ai-awaiting-human-alert-failed", {
				conversationId,
				error: String(error),
			});
		}
	} else {
		logger.warn("ai-awaiting-human-alert-skipped", {
			conversationId,
			reason: "escalate-telegram not enabled",
		});
	}
}

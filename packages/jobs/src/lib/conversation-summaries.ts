import {
	type ConversationSummary,
	type EpisodeRow,
	escapeTelegramHtml,
	isSubstantiveEpisode,
	resolveAgentCredentials,
	resolveTeamTelegramTarget,
	sendTelegramMessages,
	summarizeConversationEpisode,
} from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";
import { getRedisConnection } from "../connection";

/**
 * "What the bot said and what was concluded" (#17). Every 10 minutes, each
 * conversation that has gone idle gets its latest episode summarised; the
 * summary is stored (customer page, conversation page) and — in `each` mode
 * — sent to the team's Telegram. `summarizedThroughAt` is the watermark and
 * is written last, so a crash mid-sweep at worst repeats one summary (and the
 * (conversationId, toAt) check stops even that).
 */

const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_RUN = 50;
const MAX_EPISODE_ROWS = 100;

export interface EpisodeMessage extends EpisodeRow {
	createdAt: Date;
}

/**
 * The episode to summarise: everything after the watermark, or — the first
 * time — everything after the last pause of at least `gapMinutes`.
 */
export function selectEpisodeRows(
	rows: EpisodeMessage[],
	watermark: Date | null,
	gapMinutes: number,
): EpisodeMessage[] {
	if (watermark) {
		return rows.filter((r) => r.createdAt > watermark);
	}
	const gapMs = gapMinutes * 60_000;
	for (let i = rows.length - 1; i >= 1; i--) {
		const cur = rows[i];
		const prev = rows[i - 1];
		if (
			cur &&
			prev &&
			cur.createdAt.getTime() - prev.createdAt.getTime() >= gapMs
		) {
			return rows.slice(i);
		}
	}
	return rows;
}

const OUTCOME_LINE: Record<string, string> = {
	resolved: "✅ Resolved",
	escalated: "🔺 Escalated",
	waiting_customer: "⏳ Waiting for the customer",
	waiting_team: "⏳ Waiting for the team",
	sales_lead: "💼 Sales lead",
	info_only: "ℹ️ Info",
	unresolved: "❌ Unresolved",
	abandoned: "❌ Abandoned",
};

const MOOD_LINE: Record<string, string> = {
	satisfied: "🙂 satisfied",
	neutral: "😐 neutral",
	upset: "😠 upset",
};

export interface SummaryMessageInput {
	summary: ConversationSummary;
	customerName: string | null;
	customerUsername: string | null;
	contactPhone: string | null;
	conversationUrl: string | null;
	continuation: boolean;
}

/** The Telegram HTML for one summary. */
export function buildSummaryTelegramMessage(
	input: SummaryMessageInput,
): string {
	const s = input.summary;
	const who = input.customerName
		? `${escapeTelegramHtml(input.customerName)}${input.customerUsername ? ` (${escapeTelegramHtml(input.customerUsername)})` : ""}`
		: `Unknown customer${input.contactPhone ? ` ${escapeTelegramHtml(input.contactPhone)}` : ""}`;
	const lines = [
		`<b>${OUTCOME_LINE[s.outcome] ?? s.outcome}</b> — ${who}${input.continuation ? " <i>(follow-up to earlier conversation)</i>" : ""}`,
		`Mood: ${MOOD_LINE[s.customerMood] ?? s.customerMood}`,
		"",
		escapeTelegramHtml(s.summary),
	];
	if (s.botActions) {
		lines.push(`<b>Bot did:</b> ${escapeTelegramHtml(s.botActions)}`);
	}
	if (s.openItems) {
		lines.push(`<b>Pending:</b> ${escapeTelegramHtml(s.openItems)}`);
	}
	if (input.conversationUrl) {
		lines.push(input.conversationUrl);
	}
	return lines.join("\n");
}

/** Conversations whose latest episode is idle and not yet summarised. */
async function findDueConversationIds(): Promise<string[]> {
	const rows = await db.$queryRaw<Array<{ id: string }>>`
		SELECT c.id
		FROM ai_conversation c
		JOIN ai_agent a ON a.id = c."agentId"
		WHERE a."conversationSummaryMode" <> 'off'
		  AND c.status = 'active'
		  AND c."lastMessageAt" > NOW() - INTERVAL '24 hours'
		  AND c."lastMessageAt" <= NOW() - make_interval(mins => a."conversationSummaryIdleMinutes")
		  AND c."lastMessageAt" > COALESCE(c.summarized_through_at, 'epoch'::timestamp)
		ORDER BY c."lastMessageAt" ASC
		LIMIT ${MAX_PER_RUN}
	`;
	return rows.map((r) => r.id);
}

export async function runConversationSummarySweep(
	now: Date = new Date(),
): Promise<number> {
	const ids = await findDueConversationIds();
	let stored = 0;
	for (const id of ids) {
		try {
			if (await summarizeConversation(id, now)) {
				stored++;
			}
		} catch (error) {
			logger.error("[conversation-summaries] failed", {
				conversationId: id,
				error,
			});
		}
	}
	return stored;
}

/** Summarise one conversation's pending episode. True when a row was stored. */
export async function summarizeConversation(
	conversationId: string,
	now: Date = new Date(),
): Promise<boolean> {
	const conversation = await db.aiConversation.findUnique({
		where: { id: conversationId },
		select: {
			id: true,
			channelId: true,
			externalChatId: true,
			contactName: true,
			contactId: true,
			lastMessageAt: true,
			followUpDueAt: true,
			summarizedThroughAt: true,
			verifiedCustomerId: true,
			verifiedCustomer: {
				select: { firstName: true, lastName: true, username: true },
			},
			agent: {
				select: {
					id: true,
					organizationId: true,
					provider: true,
					encryptedApiKey: true,
					conversationSummaryMode: true,
					contextGapThresholdMinutes: true,
					organization: { select: { slug: true } },
				},
			},
		},
	});
	if (!conversation?.lastMessageAt) {
		return false;
	}
	const agent = conversation.agent;
	if (agent.conversationSummaryMode === "off") {
		return false;
	}

	// Mid-conversation or about to be nudged: a later sweep takes it.
	const lock = await getRedisConnection().exists(
		`ai:lock:${conversation.channelId}:${conversation.externalChatId}`,
	);
	if (lock) {
		return false;
	}
	if (
		conversation.followUpDueAt &&
		conversation.followUpDueAt.getTime() - now.getTime() < 15 * 60_000 &&
		conversation.followUpDueAt.getTime() > now.getTime()
	) {
		return false;
	}

	const markDone = () =>
		db.aiConversation.update({
			where: { id: conversationId },
			data: { summarizedThroughAt: conversation.lastMessageAt },
		});

	const fetched = await db.aiMessage.findMany({
		where: {
			conversationId,
			deletedAt: null,
			...(conversation.summarizedThroughAt
				? { createdAt: { gt: conversation.summarizedThroughAt } }
				: {}),
		},
		orderBy: { createdAt: "desc" },
		take: MAX_EPISODE_ROWS,
		select: {
			role: true,
			content: true,
			parts: true,
			isFollowUp: true,
			createdAt: true,
		},
	});
	const rows = selectEpisodeRows(
		fetched.reverse(),
		conversation.summarizedThroughAt,
		agent.contextGapThresholdMinutes,
	);
	const first = rows[0];
	const last = rows[rows.length - 1];
	if (!first || !last) {
		await markDone();
		return false;
	}
	const fromAt = first.createdAt;
	const toAt = last.createdAt;

	// The escalation task is written just after the tool call; allow a
	// few minutes past the last message.
	const task = await db.task.findFirst({
		where: {
			conversationId,
			source: "AI_ESCALATION",
			createdAt: {
				gte: fromAt,
				lte: new Date(toAt.getTime() + 5 * 60_000),
			},
		},
		orderBy: { createdAt: "desc" },
		select: { id: true, createdAt: true },
	});

	if (!isSubstantiveEpisode(rows, Boolean(task))) {
		await markDone();
		return false;
	}
	const duplicate = await db.aiConversationSummary.findFirst({
		where: { conversationId, toAt },
		select: { id: true },
	});
	if (duplicate) {
		await markDone();
		return false;
	}

	let credentials: ReturnType<typeof resolveAgentCredentials>;
	try {
		credentials = resolveAgentCredentials(agent);
	} catch {
		logger.warn("[conversation-summaries] agent has no API key", {
			agentId: agent.id,
		});
		return false;
	}

	const customer = conversation.verifiedCustomer;
	const customerName =
		[customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
		null;
	const result = await summarizeConversationEpisode({
		credentials,
		rows,
		customerName: customerName ?? conversation.contactName,
		customerUsername: customer?.username ?? null,
		escalated: Boolean(task),
	});
	if (!result) {
		logger.warn("[conversation-summaries] summary failed", {
			conversationId,
		});
		return false;
	}
	const { summary, model } = result;

	const count = (role: string) => rows.filter((r) => r.role === role).length;
	const previous = await db.aiConversationSummary.findFirst({
		where: {
			conversationId,
			createdAt: { gte: new Date(now.getTime() - 24 * HOUR_MS) },
		},
		select: { id: true },
	});

	const created = await db.aiConversationSummary.create({
		data: {
			organizationId: agent.organizationId,
			agentId: agent.id,
			conversationId,
			customerId: conversation.verifiedCustomerId,
			fromAt,
			toAt,
			userMessages: count("user"),
			botMessages: count("assistant"),
			adminMessages: count("admin"),
			outcome: summary.outcome,
			customerMood: summary.customerMood,
			summary: summary.summary,
			botActions: summary.botActions,
			openItems: summary.openItems,
			taskId: task?.id ?? null,
			model,
		},
		select: { id: true },
	});

	// An escalated episode already reached the team as an escalation; a second
	// write-up of it half an hour later is noise. It is still stored.
	if (agent.conversationSummaryMode === "each" && !task) {
		const target = await resolveTeamTelegramTarget(agent.id, "summary");
		if (target) {
			const message = buildSummaryTelegramMessage({
				summary,
				customerName,
				customerUsername: customer?.username ?? null,
				contactPhone: conversation.contactId,
				conversationUrl: agent.organization.slug
					? `${getBaseUrl()}/app/${agent.organization.slug}/conversations/${conversationId}`
					: null,
				continuation: Boolean(previous),
			});
			const { succeeded } = await sendTelegramMessages(
				target.botToken,
				target.chatIds,
				message,
				conversationId,
			);
			if (succeeded > 0) {
				await db.aiConversationSummary.update({
					where: { id: created.id },
					data: { telegramSentAt: new Date() },
				});
			}
		}
	}

	await markDone();
	return true;
}

const TELEGRAM_LIMIT = 3800;

/**
 * `digest` mode: one message per agent at 21:00 Beirut listing the day's
 * summaries not yet sent, then stamps them.
 */
export async function sendConversationSummaryDigests(
	now: Date = new Date(),
): Promise<number> {
	const agents = await db.aiAgent.findMany({
		where: { conversationSummaryMode: "digest" },
		select: { id: true, organization: { select: { slug: true } } },
	});
	let sent = 0;
	for (const agent of agents) {
		const summaries = await db.aiConversationSummary.findMany({
			where: {
				agentId: agent.id,
				telegramSentAt: null,
				createdAt: { gte: new Date(now.getTime() - 24 * HOUR_MS) },
			},
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				conversationId: true,
				outcome: true,
				summary: true,
				openItems: true,
				conversation: {
					select: { contactName: true, contactId: true },
				},
				customer: {
					select: { firstName: true, lastName: true, username: true },
				},
			},
		});
		if (summaries.length === 0) {
			continue;
		}
		const target = await resolveTeamTelegramTarget(agent.id, "summary");
		if (!target) {
			continue;
		}
		const entries = summaries.map((s) => {
			const name =
				[s.customer?.firstName, s.customer?.lastName]
					.filter(Boolean)
					.join(" ") ||
				s.conversation.contactName ||
				s.conversation.contactId ||
				"Unknown";
			const link = agent.organization.slug
				? ` — ${getBaseUrl()}/app/${agent.organization.slug}/conversations/${s.conversationId}`
				: "";
			return `${OUTCOME_LINE[s.outcome] ?? s.outcome} <b>${escapeTelegramHtml(name)}</b>: ${escapeTelegramHtml(s.summary)}${s.openItems ? ` <i>Pending: ${escapeTelegramHtml(s.openItems)}</i>` : ""}${link}`;
		});
		const chunks: string[] = [];
		let current = `<b>Bot conversations today (${summaries.length})</b>`;
		for (const entry of entries) {
			if (current.length + entry.length + 2 > TELEGRAM_LIMIT) {
				chunks.push(current);
				current = entry;
			} else {
				current = `${current}\n\n${entry}`;
			}
		}
		chunks.push(current);
		let ok = true;
		for (const chunk of chunks) {
			const { succeeded } = await sendTelegramMessages(
				target.botToken,
				target.chatIds,
				chunk,
				"",
			);
			ok = ok && succeeded > 0;
		}
		if (ok) {
			await db.aiConversationSummary.updateMany({
				where: { id: { in: summaries.map((s) => s.id) } },
				data: { telegramSentAt: new Date() },
			});
			sent++;
		}
	}
	return sent;
}

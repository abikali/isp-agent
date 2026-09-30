import {
	assistantMessageToParts,
	buildAgentMessages,
	buildAgentTelemetry,
	buildFollowUpInstruction,
	buildPostEscalationInstruction,
	type ChannelProvider,
	computeBotFingerprint,
	decryptToken,
	fetchServicePlansSection,
	generateAgentResponse,
	isHumanTakeoverActive,
	isNoFollowUpReply,
	isWithinFollowUpHours,
	loadHistoryRows,
	type PromptSection,
	resolveAgentCredentials,
	resolveFollowUpFireAt,
	resolveMaintenanceState,
	sendTextMessage,
	sendTypingIndicator,
	stripInternalMarkers,
} from "@repo/ai";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { getRedisConnection } from "../connection";
import {
	countRecentFollowUps,
	scheduleFollowUp,
} from "../jobs/ai-followup.jobs";

/**
 * Silence follow-ups: the checks, the generation and the send, shared by the
 * BullMQ worker (scheduled nudges), the admin "Send now" action and the
 * admin preview.
 *
 * Every skip is a legitimate reason NOT to speak: the customer (or a human
 * teammate) wrote since, a human took over, maintenance is on, the attempts
 * or the weekly cap are used up, the chat is muted, the bot's reply never
 * reached the customer, it is outside the agent's window (a job that fires
 * late after a worker restart), or another process holds the chat. The model
 * decides whether the exchange was actually finished by answering
 * NO_FOLLOW_UP. An admin's "Send now" (`force`) skips the timing and quota
 * checks, not the ones about the conversation's state.
 */

export interface FollowUpRunResult {
	sent: boolean;
	skipped?: string;
	text?: string;
}

/** A preview is reused by the worker only while nothing new happened. */
const DRAFT_TTL_SECONDS = 3 * 24 * 60 * 60;

interface FollowUpDraft {
	/** `lastMessageAt` the draft was written against. */
	basis: string | null;
	attempt: number;
	/** null = the model declined (NO_FOLLOW_UP). */
	text: string | null;
}

function draftKey(conversationId: string): string {
	return `ai:followup-draft:${conversationId}`;
}

async function readDraft(
	conversationId: string,
): Promise<FollowUpDraft | null> {
	try {
		const raw = await getRedisConnection().get(draftKey(conversationId));
		return raw ? (JSON.parse(raw) as FollowUpDraft) : null;
	} catch {
		return null;
	}
}

function loadConversation(conversationId: string, now: Date) {
	return db.aiConversation.findUnique({
		where: { id: conversationId },
		include: {
			agent: {
				include: {
					maintenanceWindows: {
						where: { startsAt: { lte: now }, endsAt: { gt: now } },
						orderBy: { endsAt: "asc" },
						select: { message: true },
					},
				},
			},
			channel: true,
			verifiedCustomer: {
				select: {
					firstName: true,
					lastName: true,
					username: true,
					accountNumber: true,
					status: true,
					plan: { select: { name: true } },
				},
			},
		},
	});
}

type LoadedConversation = NonNullable<
	Awaited<ReturnType<typeof loadConversation>>
>;

function lastMessageOf(conversationId: string) {
	return db.aiMessage.findFirst({
		where: { conversationId },
		orderBy: { createdAt: "desc" },
		select: {
			role: true,
			error: true,
			deliveryStatus: true,
			createdAt: true,
		},
	});
}

/**
 * Ask the model for the nudge. Returns null when it declines. `at` is the
 * moment it would go out: the prompt's clock and the silence length.
 */
/** The silence-nudge instruction for `attempt`, fired at `at`. */
function silenceInstruction(
	conversation: LoadedConversation,
	lastReplyAt: Date,
	attempt: number,
	at: Date,
): string {
	const agent = conversation.agent;
	const delay =
		attempt === 1
			? (agent.followUpMinutes ?? 0)
			: agent.followUpRepeatMinutes;
	// Real silence: longer than the setting when the nudge was moved to the
	// next morning.
	return buildFollowUpInstruction(
		Math.max(
			delay,
			Math.round((at.getTime() - lastReplyAt.getTime()) / 60_000),
		),
		agent.followUpMessage,
		attempt,
		Math.max(attempt, agent.followUpMaxAttempts),
	);
}

async function generateFollowUpText(
	conversation: LoadedConversation,
	lastReplyAt: Date,
	at: Date,
	instruction: string,
): Promise<string | null> {
	const agent = conversation.agent;
	const conversationId = conversation.id;
	const history = await loadHistoryRows(
		conversationId,
		agent.maxHistoryLength,
	);
	// A sales nudge ("still interested in the 10 Mbps plan?") must quote the
	// real prices, not remember them.
	const servicePlans = await fetchServicePlansSection(
		agent.organizationId,
		agent.servicePlansEnabled,
		agent.servicePlanIds,
	);
	const verified = conversation.verifiedCustomer;
	const provider = conversation.channel?.provider as ChannelProvider;
	const messages = buildAgentMessages({
		conversationId,
		systemOptions: {
			basePrompt: agent.systemPrompt,
			// No tools: a nudge must never turn into a diagnostic.
			enabledTools: [],
			knowledgeBase: agent.knowledgeBase ?? undefined,
			contactName: conversation.contactName ?? undefined,
			contactPhone: conversation.contactId ?? undefined,
			verifiedCustomer: verified
				? {
						fullName:
							[verified.firstName, verified.lastName]
								.filter(Boolean)
								.join(" ") || undefined,
						username: verified.username ?? undefined,
						accountNumber: verified.accountNumber ?? undefined,
						status: verified.status,
						planName: verified.plan?.name ?? undefined,
					}
				: undefined,
			provider,
			servicePlans,
			promptSections: agent.promptSections as unknown as PromptSection[],
			workingHours: agent,
			// The prompt's clock is the real one…
			now: at,
		},
		history,
		// …but the history is read as of the last message, so the silence
		// being followed up is not announced as a "[Context Notice: … an
		// earlier exchange]" right before the instruction.
		now: lastReplyAt,
		contextGapThresholdMinutes: agent.contextGapThresholdMinutes,
		newUserMessage: instruction,
	});

	const result = await generateAgentResponse({
		model: agent.model,
		credentials: resolveAgentCredentials(agent),
		messages,
		temperature: agent.temperature,
		sessionId: conversationId,
		telemetry: buildAgentTelemetry({
			conversationId,
			agentId: agent.id,
			organizationId: agent.organizationId,
			channelId: conversation.channelId,
			provider,
			verifiedCustomerId: conversation.verifiedCustomerId,
		}),
		abortSignal: AbortSignal.timeout(60_000),
	});
	const text = stripInternalMarkers(result.text);
	return !text || isNoFollowUpReply(text) ? null : text;
}

/**
 * What the next nudge would say, generated now and cached so that the
 * worker sends exactly this text if nothing changes before it fires.
 */
export async function draftFollowUp(conversationId: string): Promise<{
	text: string | null;
	attempt: number;
	cached: boolean;
}> {
	const now = new Date();
	const conversation = await loadConversation(conversationId, now);
	if (!conversation?.channel) {
		throw new Error("Conversation not found");
	}
	const attempt = conversation.followUpAttempts + 1;
	const basis = conversation.lastMessageAt?.toISOString() ?? null;
	const existing = await readDraft(conversationId);
	if (existing && existing.basis === basis && existing.attempt === attempt) {
		return { text: existing.text, attempt, cached: true };
	}
	const lastRow = await lastMessageOf(conversationId);
	const lastReplyAt = lastRow?.createdAt ?? now;
	const at =
		conversation.followUpDueAt && conversation.followUpDueAt > now
			? conversation.followUpDueAt
			: now;
	const text = await generateFollowUpText(
		conversation,
		lastReplyAt,
		at,
		silenceInstruction(conversation, lastReplyAt, attempt, at),
	);
	const draft: FollowUpDraft = { basis, attempt, text };
	await getRedisConnection()
		.set(
			draftKey(conversationId),
			JSON.stringify(draft),
			"EX",
			DRAFT_TTL_SECONDS,
		)
		.catch(() => {});
	return { text, attempt, cached: false };
}

export async function runFollowUp(input: {
	conversationId: string;
	/** The reply the nudge answers; activity after it cancels. null with `force`. */
	repliedAt: Date | null;
	attempt?: number | undefined;
	/** Admin "Send now": ignore the window, the attempt limit and the weekly cap. */
	force?: boolean;
	jobId?: string | undefined;
}): Promise<FollowUpRunResult> {
	const { conversationId, force = false } = input;
	const now = new Date();
	const conversation = await loadConversation(conversationId, now);
	if (!conversation?.channel || !conversation.agent) {
		return { sent: false, skipped: "conversation_or_channel_missing" };
	}
	const agent = conversation.agent;
	const attempt = input.attempt ?? conversation.followUpAttempts + 1;

	const skip = async (reason: string): Promise<FollowUpRunResult> => {
		logger.info("[ai-followup] skipped", { conversationId, reason });
		await db.aiConversation
			.update({
				where: { id: conversationId },
				data: {
					followUpDueAt: null,
					followUpOutcome: reason,
					followUpOutcomeAt: now,
				},
			})
			.catch(() => {});
		return { sent: false, skipped: reason };
	};

	if (!agent.enabled) {
		return skip("agent_disabled");
	}
	if (!agent.encryptedApiKey) {
		return skip("no_api_key");
	}
	if (conversation.status !== "active") {
		return skip("conversation_not_active");
	}
	if (
		input.repliedAt &&
		conversation.lastMessageAt &&
		conversation.lastMessageAt.getTime() > input.repliedAt.getTime() + 1000
	) {
		// A newer reply scheduled its own nudge; leave its due date alone.
		logger.info("[ai-followup] skipped", {
			conversationId,
			reason: "activity_since_reply",
		});
		return { sent: false, skipped: "activity_since_reply" };
	}
	if (!force) {
		if (agent.followUpMinutes == null) {
			return skip("follow_up_disabled");
		}
		if (
			!isWithinFollowUpHours(now, {
				start: agent.followUpWindowStart,
				end: agent.followUpWindowEnd,
			})
		) {
			return skip("quiet_hours");
		}
		if (conversation.followUpMuted) {
			return skip("muted");
		}
		if (attempt > agent.followUpMaxAttempts) {
			return skip("max_attempts");
		}
		if (
			(await countRecentFollowUps(conversation)) >=
			agent.followUpWeeklyCap
		) {
			return skip("weekly_cap");
		}
		if (
			isHumanTakeoverActive(
				conversation.humanTakeoverAt,
				agent.humanTakeoverHours,
			)
		) {
			return skip("human_takeover");
		}
		if (resolveMaintenanceState(agent, agent.maintenanceWindows).active) {
			return skip("maintenance");
		}
	}
	const lastRow = await lastMessageOf(conversationId);
	// A scheduled nudge only follows the bot's own words; an admin forcing
	// one may also follow a teammate's message.
	const followsAllowedRole =
		lastRow?.role === "assistant" || (force && lastRow?.role === "admin");
	if (!lastRow || !followsAllowedRole || lastRow.error) {
		return skip("last_message_not_a_clean_reply");
	}
	if (lastRow.deliveryStatus === "failed") {
		return skip("last_reply_not_delivered");
	}

	// Per-chat lock, no retry: busy means the customer is writing.
	const redis = getRedisConnection();
	const lockKey = `ai:lock:${conversation.channelId}:${conversation.externalChatId}`;
	const lockValue = `followup-${input.jobId ?? "manual"}-${Date.now()}`;
	const locked = Boolean(
		await redis.set(lockKey, lockValue, "EX", 120, "NX"),
	);
	if (!locked) {
		return skip("chat_lock_busy");
	}

	try {
		const basis = conversation.lastMessageAt?.toISOString() ?? null;
		const draft = await readDraft(conversationId);
		const text =
			draft && draft.basis === basis && draft.attempt === attempt
				? draft.text
				: await generateFollowUpText(
						conversation,
						lastRow.createdAt,
						now,
						silenceInstruction(
							conversation,
							lastRow.createdAt,
							attempt,
							now,
						),
					);
		redis.del(draftKey(conversationId)).catch(() => {});
		if (!text) {
			return skip("model_declined");
		}

		const apiToken = decryptToken(conversation.channel.encryptedApiToken);
		const provider = conversation.channel.provider as ChannelProvider;
		const chatId = conversation.externalChatId;
		sendTypingIndicator(provider, apiToken, chatId).catch(() => {});
		const sendResult = await sendTextMessage(
			provider,
			apiToken,
			chatId,
			text,
		);
		redis
			.set(`ai:bot-fp:${computeBotFingerprint(text)}`, "1", "EX", 600)
			.catch(() => {});
		const parts = assistantMessageToParts(text, undefined);
		const sentAt = new Date();
		const message = await db.aiMessage.create({
			data: {
				conversationId,
				role: "assistant",
				content: text,
				isFollowUp: true,
				externalMsgId: sendResult.messageId ?? null,
				...(sendResult.success ? {} : { deliveryStatus: "failed" }),
				...(parts.length > 0
					? { parts: parts as Prisma.InputJsonValue }
					: {}),
				createdAt: sentAt,
			},
			select: { id: true },
		});
		// The Bot follow-ups page's record of the nudge. Declines stay on
		// `followUpOutcome` only, so the table holds real sends.
		await db.botFollowUp
			.create({
				data: {
					organizationId: agent.organizationId,
					agentId: agent.id,
					type: "silence",
					channel: "bot",
					status: sendResult.success ? "sent" : "failed",
					conversationId,
					customerId: conversation.verifiedCustomerId,
					sentAt,
					messageText: text,
					externalMessageId: sendResult.messageId ?? null,
					aiMessageId: message.id,
				},
			})
			.catch((error) =>
				logger.warn("[ai-followup] follow-up row not written", {
					conversationId,
					error: String(error),
				}),
			);
		await db.aiConversation.update({
			where: { id: conversationId },
			data: {
				messageCount: { increment: 1 },
				lastMessageAt: sentAt,
				followUpSentAt: sentAt,
				followUpAttempts: attempt,
				followUpDueAt: null,
				followUpOutcome: sendResult.success ? "sent" : "send_failed",
				followUpOutcomeAt: sentAt,
			},
		});
		logger.info("[ai-followup] sent", { conversationId, attempt, force });

		if (sendResult.success && conversation.channelId) {
			await scheduleFollowUp({
				conversationId,
				channelId: conversation.channelId,
				from: sentAt,
				attempt: attempt + 1,
			}).catch((error) =>
				logger.warn("[ai-followup] next attempt not scheduled", {
					conversationId,
					error: String(error),
				}),
			);
		}
		return { sent: sendResult.success, text };
	} finally {
		await redis
			.eval(
				`if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
				1,
				lockKey,
				lockValue,
			)
			.catch(() => {});
	}
}

// ── Check-back after an escalation (#13) ─────────────────────────────────────

export interface PostEscalationRow {
	id: string;
	conversationId: string | null;
	taskId: string | null;
}

export interface PostEscalationResult {
	status: "sent" | "skipped" | "failed" | "rescheduled";
	skipReason?: string;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Ask the customer, in the chat they started, whether the team reached them
 * and whether the escalated problem is solved. One question, one attempt:
 * no silence nudge is scheduled after it. The row must be claimed
 * (`sending`); this writes its final state.
 */
export async function runPostEscalationCheck(
	row: PostEscalationRow,
): Promise<PostEscalationResult> {
	const now = new Date();
	const finish = async (
		result: PostEscalationResult,
		data: Prisma.BotFollowUpUpdateInput = {},
	): Promise<PostEscalationResult> => {
		await db.botFollowUp.update({
			where: { id: row.id },
			data: {
				status:
					result.status === "rescheduled"
						? "scheduled"
						: result.status,
				...(result.skipReason ? { skipReason: result.skipReason } : {}),
				...data,
			},
		});
		if (result.skipReason) {
			logger.info("[check-back] skipped", {
				followUpId: row.id,
				reason: result.skipReason,
			});
		}
		return result;
	};
	const skip = (reason: string) =>
		finish({ status: "skipped", skipReason: reason });

	if (!row.conversationId) {
		return skip("conversation_missing");
	}
	const conversation = await loadConversation(row.conversationId, now);
	if (!conversation?.channel || !conversation.agent) {
		return skip("conversation_or_channel_missing");
	}
	const agent = conversation.agent;
	const conversationId = conversation.id;
	if (!agent.enabled) {
		return skip("agent_disabled");
	}
	if (!agent.encryptedApiKey) {
		return skip("no_api_key");
	}
	if (agent.postEscalationCheckMinutes == null) {
		return skip("check_back_disabled");
	}
	if (conversation.status !== "active") {
		return skip("conversation_not_active");
	}
	if (conversation.followUpMuted) {
		return skip("muted");
	}
	if (
		isHumanTakeoverActive(
			conversation.humanTakeoverAt,
			agent.humanTakeoverHours,
		)
	) {
		return skip("human_takeover");
	}
	if (resolveMaintenanceState(agent, agent.maintenanceWindows).active) {
		return skip("maintenance");
	}
	const window = {
		start: agent.followUpWindowStart,
		end: agent.followUpWindowEnd,
	};
	if (!isWithinFollowUpHours(now, window)) {
		// A late sweep (worker restart) must not ask at night: move it.
		return finish(
			{ status: "rescheduled" },
			{ dueAt: resolveFollowUpFireAt(now, 0, window, 2) ?? now },
		);
	}
	const task = row.taskId
		? await db.task.findUnique({
				where: { id: row.taskId },
				select: {
					title: true,
					status: true,
					followUpStatus: true,
					createdAt: true,
				},
			})
		: null;
	if (!task) {
		return skip("task_missing");
	}
	if (task.followUpStatus === "resolved" || task.status === "CANCELLED") {
		return skip("task_resolved");
	}
	const recentUser = await db.aiMessage.findFirst({
		where: {
			conversationId,
			role: "user",
			createdAt: { gte: new Date(now.getTime() - 12 * HOUR_MS) },
		},
		select: { id: true },
	});
	if (recentUser) {
		return skip("customer_active");
	}
	const alreadyChecked = await db.botFollowUp.findFirst({
		where: {
			conversationId,
			type: "post_escalation",
			id: { not: row.id },
			sentAt: { gte: new Date(now.getTime() - 72 * HOUR_MS) },
		},
		select: { id: true },
	});
	if (alreadyChecked) {
		return skip("already_checked");
	}
	if ((await countRecentFollowUps(conversation)) >= agent.followUpWeeklyCap) {
		return skip("weekly_cap");
	}
	const lastRow = await lastMessageOf(conversationId);
	if (!lastRow) {
		return skip("conversation_empty");
	}
	if (lastRow.deliveryStatus === "failed") {
		return skip("last_reply_not_delivered");
	}

	const redis = getRedisConnection();
	const lockKey = `ai:lock:${conversation.channelId}:${conversation.externalChatId}`;
	const lockValue = `checkback-${row.id}-${Date.now()}`;
	const locked = Boolean(
		await redis.set(lockKey, lockValue, "EX", 120, "NX"),
	);
	if (!locked) {
		return finish(
			{ status: "rescheduled" },
			{ dueAt: new Date(now.getTime() + 10 * 60_000) },
		);
	}

	try {
		const teamReplied = await db.aiMessage.findFirst({
			where: {
				conversationId,
				role: "admin",
				createdAt: { gt: task.createdAt },
			},
			select: { id: true },
		});
		const hours = Math.max(
			1,
			Math.round((now.getTime() - task.createdAt.getTime()) / HOUR_MS),
		);
		const instruction = buildPostEscalationInstruction(
			hours,
			task.title,
			Boolean(teamReplied),
		);
		const text = await generateFollowUpText(
			conversation,
			lastRow.createdAt,
			now,
			instruction,
		);
		if (!text) {
			return skip("model_declined");
		}

		const apiToken = decryptToken(conversation.channel.encryptedApiToken);
		const provider = conversation.channel.provider as ChannelProvider;
		const sendResult = await sendTextMessage(
			provider,
			apiToken,
			conversation.externalChatId,
			text,
		);
		redis
			.set(`ai:bot-fp:${computeBotFingerprint(text)}`, "1", "EX", 600)
			.catch(() => {});
		const parts = assistantMessageToParts(text, undefined);
		const sentAt = new Date();
		const message = await db.aiMessage.create({
			data: {
				conversationId,
				role: "assistant",
				content: text,
				// Counts toward the weekly cap like any nudge.
				isFollowUp: true,
				externalMsgId: sendResult.messageId ?? null,
				...(sendResult.success ? {} : { deliveryStatus: "failed" }),
				...(parts.length > 0
					? { parts: parts as Prisma.InputJsonValue }
					: {}),
				createdAt: sentAt,
			},
			select: { id: true },
		});
		await db.aiConversation.update({
			where: { id: conversationId },
			data: {
				messageCount: { increment: 1 },
				lastMessageAt: sentAt,
			},
		});
		logger.info("[check-back] sent", {
			followUpId: row.id,
			conversationId,
			success: sendResult.success,
		});
		return finish(
			sendResult.success
				? { status: "sent" }
				: { status: "failed", skipReason: "send_failed" },
			{
				sentAt,
				messageText: text,
				aiMessageId: message.id,
				externalMessageId: sendResult.messageId ?? null,
			},
		);
	} finally {
		await redis
			.eval(
				`if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
				1,
				lockKey,
				lockValue,
			)
			.catch(() => {});
	}
}

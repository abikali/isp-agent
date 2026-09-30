import {
	classifyCheckBackReply,
	escapeTelegramHtml,
	type ModelCredentials,
	notifyTeamTelegram,
} from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { appendTaskNote, formatBeirutStamp, getBaseUrl } from "@repo/utils";
import { runPostEscalationCheck } from "./ai-follow-up";
import { sendOutreachTemplate } from "./outreach";

/**
 * The `bot_follow_up` table is the send queue for every follow-up that is
 * not a silence nudge: the check-back after an escalation (bot number) and
 * the official-number outreach. No BullMQ job per message — the table holds
 * the due time, the approval state and the result, and this sweep (every
 * 5 minutes) moves rows along.
 */

const HOUR_MS = 60 * 60 * 1000;
const BATCH = 20;

export interface SweepResult {
	dispatched: number;
	noReply: number;
	expired: number;
}

/** Due row → its sender. Returns the final status. */
async function dispatch(row: {
	id: string;
	organizationId: string;
	agentId: string | null;
	type: string;
	customerId: string | null;
	conversationId: string | null;
	taskId: string | null;
	paymentId: string | null;
	phone: string | null;
	createdAt: Date;
}): Promise<string> {
	switch (row.type) {
		case "post_escalation":
			return (await runPostEscalationCheck(row)).status;
		case "post_install":
		case "post_stop":
			return sendOutreachTemplate(row);
		default:
			await db.botFollowUp.update({
				where: { id: row.id },
				data: { status: "skipped", skipReason: "unknown_type" },
			});
			return "skipped";
	}
}

export async function runBotFollowUpSweep(
	now: Date = new Date(),
): Promise<SweepResult> {
	const due = await db.botFollowUp.findMany({
		where: { status: "scheduled", dueAt: { lte: now } },
		orderBy: { dueAt: "asc" },
		take: BATCH,
		select: {
			id: true,
			organizationId: true,
			agentId: true,
			type: true,
			customerId: true,
			conversationId: true,
			taskId: true,
			paymentId: true,
			phone: true,
			createdAt: true,
		},
	});

	let dispatched = 0;
	for (const row of due) {
		// Claim: a second sweep (or "Send now") racing this one gets 0.
		const { count } = await db.botFollowUp.updateMany({
			where: { id: row.id, status: "scheduled" },
			data: { status: "sending" },
		});
		if (count === 0) {
			continue;
		}
		try {
			await dispatch(row);
			dispatched++;
		} catch (error) {
			logger.error("[bot-follow-ups] dispatch failed", {
				followUpId: row.id,
				type: row.type,
				error,
			});
			await db.botFollowUp
				.update({
					where: { id: row.id },
					data: {
						status: "failed",
						skipReason: (error instanceof Error
							? error.message
							: String(error)
						).slice(0, 500),
					},
				})
				.catch(() => {});
		}
	}

	// A claim whose worker died never finishes; fail it rather than risk a
	// second send.
	await db.botFollowUp.updateMany({
		where: {
			status: "sending",
			updatedAt: { lt: new Date(now.getTime() - HOUR_MS) },
		},
		data: { status: "failed", skipReason: "interrupted" },
	});

	// Sent 48 hours ago and never answered.
	const stale = await db.botFollowUp.findMany({
		where: {
			status: "sent",
			sentAt: { lt: new Date(now.getTime() - 48 * HOUR_MS) },
		},
		select: { id: true, type: true, taskId: true },
		take: 500,
	});
	if (stale.length > 0) {
		await db.botFollowUp.updateMany({
			where: { id: { in: stale.map((r) => r.id) }, status: "sent" },
			data: { status: "no_reply", outcome: "no_reply" },
		});
		// We asked; nobody answered. The task records that contact was made.
		const taskIds = stale
			.filter((r) => r.type === "post_escalation" && r.taskId)
			.map((r) => r.taskId as string);
		if (taskIds.length > 0) {
			await db.task.updateMany({
				where: { id: { in: taskIds }, followUpStatus: null },
				data: { followUpStatus: "contacted" },
			});
		}
	}

	// Nobody approved an outreach within three days of its due time.
	const { count: expired } = await db.botFollowUp.updateMany({
		where: {
			status: "pending_approval",
			dueAt: { lt: new Date(now.getTime() - 72 * HOUR_MS) },
		},
		data: { status: "skipped", skipReason: "approval_expired" },
	});

	return { dispatched, noReply: stale.length, expired };
}

// ── In-chat replies (bot number) ─────────────────────────────────────────────

/**
 * The customer wrote in a chat where we recently followed up: record it as
 * the answer. Called when the inbound message is stored. Never throws.
 */
export async function captureFollowUpReply(
	conversationId: string,
	text: string,
	now: Date = new Date(),
): Promise<{ id: string; type: string } | null> {
	try {
		const row = await db.botFollowUp.findFirst({
			where: {
				conversationId,
				channel: "bot",
				status: { in: ["sent", "replied"] },
				sentAt: { gte: new Date(now.getTime() - 72 * HOUR_MS) },
			},
			orderBy: { sentAt: "desc" },
			select: { id: true, type: true, reply: true, replyAt: true },
		});
		if (!row) {
			return null;
		}
		await db.botFollowUp.update({
			where: { id: row.id },
			data: {
				status: "replied",
				replyAt: row.replyAt ?? now,
				reply: (row.reply ? `${row.reply}\n${text}` : text).slice(
					0,
					2000,
				),
			},
		});
		return { id: row.id, type: row.type };
	} catch (error) {
		logger.warn("[bot-follow-ups] reply not captured", {
			conversationId,
			error: String(error),
		});
		return null;
	}
}

/**
 * After the bot answered a customer's reply to a check-back: read the answer
 * and close the loop. "yes" closes the escalation task, "no" reopens it and
 * tells the team (unless the bot escalated again this turn, which already
 * did), "unclear" is left for the conversation summary. Never throws.
 */
export async function settleCheckBackReplies(input: {
	conversationId: string;
	credentials: ModelCredentials;
	botReply: string | null;
	/** The bot called escalate-telegram this turn. */
	escalatedThisTurn: boolean;
	now?: Date | undefined;
}): Promise<void> {
	const now = input.now ?? new Date();
	try {
		const rows = await db.botFollowUp.findMany({
			where: {
				conversationId: input.conversationId,
				type: "post_escalation",
				status: "replied",
				outcome: null,
				reason: null,
			},
			select: {
				id: true,
				agentId: true,
				taskId: true,
				messageText: true,
				reply: true,
				organization: { select: { slug: true } },
				conversation: {
					select: {
						contactName: true,
						contactId: true,
						verifiedCustomer: {
							select: {
								firstName: true,
								lastName: true,
								username: true,
							},
						},
					},
				},
			},
		});
		for (const row of rows) {
			const verdict = await classifyCheckBackReply({
				credentials: input.credentials,
				checkBack: row.messageText ?? "",
				customerReplies: row.reply ? [row.reply] : [],
				botReply: input.botReply,
			});
			if (!verdict) {
				continue;
			}
			const stamp = `[${formatBeirutStamp(now)} Beirut]`;
			if (verdict.resolved === "unclear") {
				await db.botFollowUp.update({
					where: { id: row.id },
					data: { reason: `Unclear: ${verdict.reason}` },
				});
				continue;
			}
			const solved = verdict.resolved === "yes";
			await db.botFollowUp.update({
				where: { id: row.id },
				data: {
					status: "resolved",
					outcome: solved ? "resolved" : "unresolved",
					reason: verdict.reason,
				},
			});
			const task = row.taskId
				? await db.task.findUnique({
						where: { id: row.taskId },
						select: { id: true, notes: true, status: true },
					})
				: null;
			if (!task) {
				continue;
			}
			if (solved) {
				await db.task.update({
					where: { id: task.id },
					data: {
						notes: appendTaskNote(
							task.notes,
							`${stamp} Check-back: customer confirmed solved — ${verdict.reason}`,
						),
						followUpStatus: "resolved",
						status: "COMPLETED",
						completedAt: now,
					},
				});
				continue;
			}
			// Priority stays: HIGH is for outages, not for "still broken".
			await db.task.update({
				where: { id: task.id },
				data: {
					notes: appendTaskNote(
						task.notes,
						`${stamp} Check-back: still NOT solved — ${verdict.reason}`,
					),
					followUpStatus: "escalated",
					...(task.status === "COMPLETED"
						? { status: "OPEN", completedAt: null }
						: {}),
				},
			});
			if (!input.escalatedThisTurn && row.agentId) {
				const c = row.conversation?.verifiedCustomer;
				const name =
					[c?.firstName, c?.lastName].filter(Boolean).join(" ") ||
					row.conversation?.contactName ||
					row.conversation?.contactId ||
					"Unknown customer";
				const link = row.organization.slug
					? `${getBaseUrl()}/app/${row.organization.slug}/conversations/${input.conversationId}`
					: "";
				await notifyTeamTelegram(
					row.agentId,
					`🔁 <b>Still NOT solved after check-back</b> — ${escapeTelegramHtml(name)}${c?.username ? ` (${escapeTelegramHtml(c.username)})` : ""}\n${escapeTelegramHtml(verdict.reason)}\n${link}`,
					{ conversationId: input.conversationId },
				);
			}
		}
	} catch (error) {
		logger.warn("[bot-follow-ups] check-back not settled", {
			conversationId: input.conversationId,
			error: String(error),
		});
	}
}

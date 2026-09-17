import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { resolveContactCustomer } from "./contact-customer";
import { type DbMessageRow, selectHistoryWindow } from "./history";
import type { ToolRecord, ToolResult } from "./types";

/** A teammate spoke in the chat this recently: they already know the contact. */
const RECENT_TEAMMATE_MS = 7 * 24 * 60 * 60_000;

const MIN_SUBSTANTIVE_MESSAGES = 2;

export interface UnknownContactExchange {
	/** `createdAt` of the first row of the current exchange. */
	startedAt: Date | null;
	/** Customer messages in the exchange that actually say something. */
	substantive: DbMessageRow[];
	/** Bot replies already sent in the exchange. */
	botReplies: number;
}

/**
 * Whether a customer message says something a human could act on. Media
 * placeholders and image descriptions (`[Image: …]`, `[Voice message
 * received]`) are dropped — only the customer's own words count, which for a
 * voice note means its transcript. What is left must hold two words of two
 * letters or more, or eight letters in total: "لذب٨", "👍", "ok" and "?" do
 * not qualify.
 */
export function isSubstantiveCustomerText(content: string): boolean {
	const words = content
		.replace(/\[[^\]]*\]/g, " ")
		.replace(/[^\p{L}\s]/gu, "")
		.split(/\s+/)
		.filter((word) => word.length >= 2);
	const letters = words.reduce((sum, word) => sum + word.length, 0);
	return words.length >= 2 || letters >= 8;
}

/**
 * The current exchange = the rows after the latest pause of at least
 * `thresholdMinutes`, within the same window the reply model sees (so a chat
 * revived after months starts a fresh exchange instead of counting April's
 * messages). Returns null when rows lack timestamps.
 */
export function unknownContactExchange(
	rows: DbMessageRow[],
	thresholdMinutes: number,
	now: Date,
): UnknownContactExchange | null {
	const window = selectHistoryWindow(rows, { thresholdMinutes, now });
	if (!window) {
		return null;
	}
	const exchange = window.rows.slice(window.pause?.index ?? 0);
	return {
		startedAt: exchange[0]?.createdAt ?? null,
		substantive: exchange.filter(
			(row) =>
				row.role === "user" && isSubstantiveCustomerText(row.content),
		),
		botReplies: exchange.filter((row) => row.role === "assistant").length,
	};
}

const ARABIC_RE = /[؀-ۿ]/;

function notifiedSentence(replyText: string): string {
	return ARABIC_RE.test(replyText)
		? "بلّغت حدا من الفريق، ورح يتواصل معك قريباً."
		: "I've notified a team member who will join you shortly.";
}

export interface UnknownContactInput {
	conversation: {
		id: string;
		organizationId: string;
		contactName: string | null;
		contactId: string | null;
		verifiedCustomerId: string | null;
		unknownEscalatedAt: Date | null;
	};
	enabledTools: string[];
	tools: ToolRecord | undefined;
	/** DB rows (with `createdAt`) the reply was generated from. */
	history: DbMessageRow[];
	contextGapThresholdMinutes: number;
	/** The reply about to be sent — the sentence is added in its language. */
	replyText: string;
	now?: Date | undefined;
}

/**
 * When the bot still cannot tell who it is talking to after a real back and
 * forth, tell a human — once per exchange.
 *
 * Fires only when all hold:
 * - escalate-telegram is enabled and the conversation is not verified;
 * - it has not already fired during the current exchange (a chat revived
 *   after a long silence is a new exchange);
 * - the customer sent at least two messages in this exchange that say
 *   something, and the bot has already replied at least once;
 * - no teammate wrote in the chat during the last 7 days;
 * - the phone does not match exactly one customer of any status (a PENDING
 *   or stopped subscriber is known to the team, not an unknown contact).
 *
 * It used to count every user-role model message, the injected context
 * notice included, so a revived chat plus a single stray "لذب٨" filed an
 * urgent escalation built from a months-old outage.
 *
 * Returns the sentence to append to the reply and the tool result to record
 * on the assistant message, or null when nothing was done.
 */
export async function maybeEscalateUnknownContact(
	input: UnknownContactInput,
): Promise<{ note: string; toolResult: ToolResult } | null> {
	const { conversation, tools } = input;
	const escalateTool = tools?.["escalate-telegram"];
	if (
		!escalateTool?.execute ||
		!input.enabledTools.includes("escalate-telegram") ||
		conversation.verifiedCustomerId
	) {
		return null;
	}

	const now = input.now ?? new Date();
	const exchange = unknownContactExchange(
		input.history,
		input.contextGapThresholdMinutes,
		now,
	);
	if (
		!exchange?.startedAt ||
		exchange.substantive.length < MIN_SUBSTANTIVE_MESSAGES ||
		exchange.botReplies === 0
	) {
		return null;
	}
	const startedAt = exchange.startedAt;
	if (
		conversation.unknownEscalatedAt &&
		conversation.unknownEscalatedAt >= startedAt
	) {
		return null;
	}

	let claimed = false;
	try {
		const teammateMessage = await db.aiMessage.findFirst({
			where: {
				conversationId: conversation.id,
				role: "admin",
				createdAt: {
					gte: new Date(now.getTime() - RECENT_TEAMMATE_MS),
				},
			},
			select: { id: true },
		});
		if (teammateMessage) {
			return null;
		}

		if (conversation.contactId) {
			const match = await resolveContactCustomer(
				conversation.organizationId,
				conversation.contactId,
			);
			if (match) {
				logger.info("ai-unknown-contact-skipped", {
					conversationId: conversation.id,
					reason: "phone matches a customer",
					customerStatus: match.status,
				});
				return null;
			}
		}

		// Claim atomically: the webhook loop reuses a conversation object
		// whose `unknownEscalatedAt` is stale after the first escalation, and
		// the retry worker can run alongside it.
		const claim = await db.aiConversation.updateMany({
			where: {
				id: conversation.id,
				OR: [
					{ unknownEscalatedAt: null },
					{ unknownEscalatedAt: { lt: startedAt } },
				],
			},
			data: { unknownEscalatedAt: now },
		});
		if (claim.count === 0) {
			return null;
		}
		claimed = true;

		const recent = exchange.substantive
			.slice(-3)
			.map((row) => row.content.slice(0, 200))
			.join("\n");
		const who =
			conversation.contactName ?? conversation.contactId ?? "no name";
		const args = {
			reason: "Unknown contact — could not be identified after several messages",
			priority: "medium" as const,
			category: "general" as const,
			summary: `Unknown contact (${who}) sent ${exchange.substantive.length} messages in this exchange but the bot could not link them to a customer (the phone matches no customer on file, and they have not given a username). Recent messages:\n${recent}`,
			customerName: conversation.contactName ?? undefined,
			actionRequired:
				"Reach out to the contact, confirm who they are and which account is theirs.",
		};
		const toolCallId = `unknown-${conversation.id}`;
		const result = (await escalateTool.execute(args, {
			toolCallId,
			messages: [],
			abortSignal: AbortSignal.timeout(30000),
		})) as { success?: boolean } | undefined;

		if (!result?.success) {
			await db.aiConversation.update({
				where: { id: conversation.id },
				data: { unknownEscalatedAt: conversation.unknownEscalatedAt },
			});
			return null;
		}

		logger.info("ai-unknown-contact-escalated", {
			conversationId: conversation.id,
			substantiveMessages: exchange.substantive.length,
			botReplies: exchange.botReplies,
			exchangeStartedAt: startedAt.toISOString(),
		});
		return {
			note: notifiedSentence(input.replyText),
			toolResult: {
				toolCallId,
				toolName: "escalate-telegram",
				args,
				result,
			},
		};
	} catch (error) {
		logger.error("Unknown contact auto-escalation failed", {
			conversationId: conversation.id,
			error,
		});
		if (claimed) {
			await db.aiConversation
				.update({
					where: { id: conversation.id },
					data: {
						unknownEscalatedAt: conversation.unknownEscalatedAt,
					},
				})
				.catch(() => {});
		}
		return null;
	}
}

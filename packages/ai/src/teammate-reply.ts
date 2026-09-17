import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { beirutParts } from "@repo/utils";
import { z } from "zod";
import { classifyText } from "./classify";
import { isMediaPlaceholder } from "./history";

/**
 * A customer message sent this long after a teammate's message is no longer
 * read as an answer to it.
 */
export const TEAMMATE_REPLY_WINDOW_MS = 24 * 60 * 60_000;

const MAX_CUSTOMER_MESSAGES = 10;

export interface TeammateReplyRow {
	role: string;
	content: string;
	attachmentType: string | null;
	createdAt: Date;
}

const teammateReplySchema = z.object({
	addressedToTeammate: z.boolean(),
	reason: z.string(),
});

const TEAMMATE_REPLY_SYSTEM_PROMPT = `You support the customer-service bot of an ISP (internet provider) in Lebanon. Customers write in Lebanese Arabic, Arabizi, English or French.

A human teammate from the company wrote to the customer in the chat. The bot stayed silent. The customer has now written back. Decide whether the customer's messages are addressed to that teammate (the teammate should handle them and the bot should stay silent) or whether the bot should reply.

addressedToTeammate = true when the customer's messages only answer or continue what the teammate said, for example:
- acknowledging or thanking ("ok", "tamem", "merci", "7ader", "👍");
- answering the teammate's question or giving the information the teammate asked for;
- responding to a collection or payment request ("ba3tak bokra", "jehzo masare", "sent it by Whish", a receipt or transfer screenshot);
- agreeing on, confirming or rescheduling a visit or appointment the teammate proposed.

addressedToTeammate = false when any of the customer's messages needs the bot, for example:
- a new question or a new problem not related to the teammate's message (internet down or slow, a plan or price question, a router issue);
- the customer asks for the bot or for automatic help, or says nobody from the team answered them;
- the messages cannot be tied to the teammate's message at all.

When unsure, answer false: a customer left without any reply is worse than an unnecessary reply.
Give a short reason in English.`;

function describeRow(row: TeammateReplyRow): string {
	const content = row.content.trim();
	if (row.attachmentType && isMediaPlaceholder(content)) {
		return `[${row.attachmentType}, content not visible]`;
	}
	if (row.attachmentType) {
		return `[${row.attachmentType}, transcribed] ${content}`;
	}
	return content;
}

function formatBeirut(value: Date): string {
	const { year, month, day, hour, minute } = beirutParts(value);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

export function buildTeammateReplyPrompt(
	teammate: TeammateReplyRow,
	customerMessages: TeammateReplyRow[],
): string {
	const lines = customerMessages.map(
		(row) => `- (${formatBeirut(row.createdAt)}) ${describeRow(row)}`,
	);
	return [
		`Teammate's message (${formatBeirut(teammate.createdAt)} Beirut time):\n${describeRow(teammate)}`,
		`Customer's messages since then, oldest first:\n${lines.join("\n")}`,
	].join("\n\n");
}

/**
 * The teammate message and the customer messages that follow it, when the
 * customer is plausibly answering that teammate: the newest non-customer row
 * is a teammate's (not a bot reply) and the newest customer message came
 * within 24 hours of it. Rows are newest first, as loaded.
 */
export function teammateReplyExchange(
	lastNonCustomer: TeammateReplyRow | null,
	customerMessagesNewestFirst: TeammateReplyRow[],
): { teammate: TeammateReplyRow; customerMessages: TeammateReplyRow[] } | null {
	if (lastNonCustomer?.role !== "admin") {
		return null;
	}
	const newest = customerMessagesNewestFirst[0];
	if (
		!newest ||
		newest.createdAt.getTime() - lastNonCustomer.createdAt.getTime() >
			TEAMMATE_REPLY_WINDOW_MS
	) {
		return null;
	}
	return {
		teammate: lastNonCustomer,
		customerMessages: [...customerMessagesNewestFirst].reverse(),
	};
}

/**
 * Whether the bot should stay silent because the customer is answering a
 * human teammate. Human takeover only lasts `humanTakeoverHours` (1h on
 * prod), so a customer answering a teammate's collection message hours later
 * used to get a bot reply that reopened unrelated topics.
 *
 * Callers run this after the takeover check, with the customer's message
 * already stored. It never touches `humanTakeoverAt`. Returns false (reply as
 * usual) when the last word before the customer was the bot's, the teammate
 * wrote more than 24h before the customer, or the classifier fails.
 */
export async function shouldDeferToTeammate(input: {
	conversationId: string;
}): Promise<boolean> {
	const { conversationId } = input;
	const select = {
		role: true,
		content: true,
		attachmentType: true,
		createdAt: true,
	} as const;

	const lastNonCustomer = await db.aiMessage.findFirst({
		where: { conversationId, role: { not: "user" } },
		orderBy: { createdAt: "desc" },
		select,
	});
	if (lastNonCustomer?.role !== "admin") {
		return false;
	}

	const customerMessages = await db.aiMessage.findMany({
		where: {
			conversationId,
			role: "user",
			createdAt: { gt: lastNonCustomer.createdAt },
		},
		orderBy: { createdAt: "desc" },
		take: MAX_CUSTOMER_MESSAGES,
		select,
	});

	const exchange = teammateReplyExchange(lastNonCustomer, customerMessages);
	if (!exchange) {
		return false;
	}

	const result = await classifyText({
		systemPrompt: TEAMMATE_REPLY_SYSTEM_PROMPT,
		userPrompt: buildTeammateReplyPrompt(
			exchange.teammate,
			exchange.customerMessages,
		),
		schema: teammateReplySchema,
	});

	// Loaded newest first; teammateReplyExchange guarantees one exists.
	const newestAt =
		customerMessages[0]?.createdAt ?? exchange.teammate.createdAt;
	logger.info("ai-teammate-reply-classified", {
		conversationId,
		addressedToTeammate: result?.addressedToTeammate ?? null,
		reason: result?.reason ?? "classifier failed",
		customerMessages: exchange.customerMessages.length,
		minutesSinceTeammate: Math.round(
			(newestAt.getTime() - exchange.teammate.createdAt.getTime()) /
				60_000,
		),
	});

	return result?.addressedToTeammate === true;
}

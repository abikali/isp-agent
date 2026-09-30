import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { beirutParts } from "@repo/utils";
import { z } from "zod";
import { classifyText } from "./classify";
import { isMediaPlaceholder } from "./history";
import type { ModelCredentials } from "./model-registry";

/**
 * A customer message sent this long after a teammate's message is no longer
 * read as an answer to it. 24h turned a teammate's evening message into
 * silence the next morning; 6h still covers a customer answering a
 * collection message hours later.
 */
export const TEAMMATE_REPLY_WINDOW_MS = 6 * 60 * 60_000;

/** A bare "??" this long after the teammate means "nobody answered me". */
const BARE_PING_AFTER_MS = 10 * 60_000;

const MAX_CUSTOMER_MESSAGES = 10;

export interface TeammateReplyRow {
	role: string;
	content: string;
	attachmentType: string | null;
	createdAt: Date;
}

export const teammateReplySchema = z.object({
	addressedToTeammate: z.boolean(),
	needsTeammateAction: z.boolean(),
	reason: z.string(),
});

const TEAMMATE_REPLY_SYSTEM_PROMPT = `You support the customer-service bot of an ISP (internet provider) in Lebanon. Customers write in Lebanese Arabic, Arabizi, English or French.

A human teammate from the company wrote to the customer. The bot stayed silent. The customer has now written back. Answer two questions.

1. addressedToTeammate — are the customer's messages only a continuation of what the teammate said, so the teammate (not the bot) should answer?
true when the messages only:
- acknowledge or thank ("ok", "tamem", "merci", "7ader", "👍", a sticker);
- answer the teammate's question or give the information the teammate asked for;
- respond to a payment request the teammate made ("ba3tak bokra", a receipt or transfer screenshot);
- confirm or reschedule a visit the teammate proposed.
false when ANY message:
- raises a new question or problem (internet down or slow, a plan, price, invoice or router question);
- asks the company to DO something now that the teammate did not already promise (turn the internet on / reactivate, stop, change plan, send an invoice, send a technician);
- says nobody answered, asks again ("??", "shu l 7al?"), or asks for the bot;
- cannot be tied to the teammate's message.
When unsure, answer false: a customer left without any reply is worse than an unnecessary reply.

2. needsTeammateAction — does anything in the customer's messages still require a person to reply or act (a question, a request, a problem report, a payment or document that must be checked, a proposed time that must be confirmed)? false only for pure acknowledgements, thanks, greetings or stickers.

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
 * within `TEAMMATE_REPLY_WINDOW_MS` of it. Rows are newest first, as loaded.
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

const NO_REPLY_RE =
	/(ma|mish|mesh)\s*(7ada|hada|had)?\s*(rad|redd|radd)|leh\s*ma\s*rad|ma\s*rad(e|ei|et|ayt)|ليش\s*ما\s*(رد|ردّ|رديت)|ما\s*(حدا\s*)?(رد|عم\s*يرد)|ما\s*رديت|no\s*(one|body)\s*(answer|repl|respond)|why\s*(no|didn.?t\s*(you|anyone))\s*(answer|repl|respond)|personne\s*ne\s*r[ée]pond|pas\s*de\s*r[ée]ponse/i;

/** The customer complains that nobody answered them. */
export function complainsNoReply(text: string): boolean {
	return NO_REPLY_RE.test(text);
}

const BARE_PING_RE = /^[\s?؟!.]+$/;

/**
 * The newest customer message is only "?", "؟", "!" or "." and came 10 min or
 * more after the teammate — a "hello, anyone?" nudge, not an answer.
 */
export function isBarePing(
	teammate: TeammateReplyRow,
	customerMessagesOldestFirst: TeammateReplyRow[],
): boolean {
	const newest =
		customerMessagesOldestFirst[customerMessagesOldestFirst.length - 1];
	return (
		!!newest &&
		BARE_PING_RE.test(newest.content) &&
		newest.createdAt.getTime() - teammate.createdAt.getTime() >=
			BARE_PING_AFTER_MS
	);
}

type TeammateVerdict =
	/** No teammate exchange to judge (bot spoke last, or outside the window). */
	| { kind: "none" }
	/** A deterministic rule says the customer is waiting on an answer. */
	| { kind: "override"; rule: "complains-no-reply" | "bare-ping" }
	| {
			kind: "classified";
			addressedToTeammate: boolean;
			needsTeammateAction: boolean;
	  }
	| { kind: "failed" };

async function judgeTeammateExchange(input: {
	conversationId: string;
	credentials: ModelCredentials;
}): Promise<TeammateVerdict> {
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
		return { kind: "none" };
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
		return { kind: "none" };
	}

	// Loaded newest first; teammateReplyExchange guarantees one exists.
	const newestAt =
		customerMessages[0]?.createdAt ?? exchange.teammate.createdAt;
	const minutesSinceTeammate = Math.round(
		(newestAt.getTime() - exchange.teammate.createdAt.getTime()) / 60_000,
	);

	const rule = complainsNoReply(
		exchange.customerMessages.map((m) => m.content).join("\n"),
	)
		? "complains-no-reply"
		: isBarePing(exchange.teammate, exchange.customerMessages)
			? "bare-ping"
			: null;
	if (rule) {
		logger.info("ai-teammate-reply-override", {
			conversationId,
			rule,
			minutesSinceTeammate,
		});
		return { kind: "override", rule };
	}

	const result = await classifyText({
		systemPrompt: TEAMMATE_REPLY_SYSTEM_PROMPT,
		userPrompt: buildTeammateReplyPrompt(
			exchange.teammate,
			exchange.customerMessages,
		),
		schema: teammateReplySchema,
		credentials: input.credentials,
	});

	logger.info("ai-teammate-reply-classified", {
		conversationId,
		addressedToTeammate: result?.addressedToTeammate ?? null,
		needsTeammateAction: result?.needsTeammateAction ?? null,
		reason: result?.reason ?? "classifier failed",
		customerMessages: exchange.customerMessages.length,
		minutesSinceTeammate,
	});

	if (!result) {
		return { kind: "failed" };
	}
	return {
		kind: "classified",
		addressedToTeammate: result.addressedToTeammate,
		needsTeammateAction: result.needsTeammateAction,
	};
}

export interface TeammateDeferral {
	defer: true;
	/** Something in the customer's messages still needs a person. */
	needsAction: boolean;
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
 * wrote more than 6h before the customer, the customer says nobody answered
 * or sends a bare "??" ping, or the classifier fails. A deferral with
 * `needsAction` must be followed up (teammate-wait), never left silent.
 */
export async function shouldDeferToTeammate(input: {
	conversationId: string;
	credentials: ModelCredentials;
}): Promise<TeammateDeferral | false> {
	const verdict = await judgeTeammateExchange(input);
	if (verdict.kind !== "classified" || !verdict.addressedToTeammate) {
		return false;
	}
	return { defer: true, needsAction: verdict.needsTeammateAction };
}

/**
 * Whether the customer's messages since the teammate still need a person to
 * reply or act. Used for messages held during a takeover, which are never
 * classified on arrival. Errs towards true: an unnecessary alert is cheaper
 * than a customer left without any reply.
 */
export async function teammateActionNeeded(input: {
	conversationId: string;
	credentials: ModelCredentials;
}): Promise<boolean> {
	const verdict = await judgeTeammateExchange(input);
	return verdict.kind !== "classified" || verdict.needsTeammateAction;
}

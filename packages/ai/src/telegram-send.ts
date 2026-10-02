import { logger } from "@repo/logs";

/**
 * Telegram sends to the team through the `escalate-telegram` tool's bot.
 * Shared by the escalation tool, the conversation summaries and the
 * follow-up alerts, so they all reach the same chats.
 */

export function parseChatIds(raw: string | string[]): string[] {
	if (Array.isArray(raw)) {
		return raw.map((id) => String(id).trim()).filter((id) => id.length > 0);
	}
	return raw
		.split(/[\n,]+/)
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

export async function sendTelegramMessages(
	botToken: string,
	chatIds: string[],
	message: string,
	conversationId: string,
): Promise<{ succeeded: number; failed: string[] }> {
	const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
	const failedIds: string[] = [];
	let succeeded = 0;

	await Promise.allSettled(
		chatIds.map(async (chatId) => {
			try {
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: Number(chatId),
						text: message,
						parse_mode: "HTML",
					}),
				});

				const data = (await response.json()) as {
					ok: boolean;
					description?: string;
				};

				if (data.ok) {
					succeeded++;
				} else {
					logger.error(
						`Telegram escalation failed for chat ${chatId}: ${data.description ?? response.status}`,
						{ chatId, conversationId },
					);
					failedIds.push(chatId);
				}
			} catch (error) {
				logger.error(`Telegram escalation failed for chat ${chatId}`, {
					error,
					conversationId,
				});
				failedIds.push(chatId);
			}
		}),
	);

	return { succeeded, failed: failedIds };
}

export interface TeamTelegramTarget {
	botToken: string;
	chatIds: string[];
}

function readChatIds(cfg: Record<string, unknown>, key: string): string[] {
	const raw = cfg[key];
	if (typeof raw === "string") {
		return parseChatIds(raw);
	}
	if (Array.isArray(raw)) {
		return parseChatIds(raw.map(String));
	}
	return [];
}

/**
 * The agent's team chats, from its `escalate-telegram` config. `summary`
 * picks the optional `summaryTelegramChatIds` list (conversation summaries),
 * falling back to the escalation chats. null when the tool is not configured.
 */
export async function resolveTeamTelegramTarget(
	agentId: string,
	purpose: "escalation" | "summary" = "escalation",
): Promise<TeamTelegramTarget | null> {
	const { db } = await import("@repo/database");
	const row = await db.aiAgentToolConfig.findFirst({
		where: { agentId, toolId: "escalate-telegram" },
		select: { config: true },
	});
	const cfg = (row?.config ?? {}) as Record<string, unknown>;
	const botToken = cfg["telegramBotToken"];
	if (typeof botToken !== "string" || !botToken) {
		return null;
	}
	const escalationIds = readChatIds(cfg, "telegramChatIds");
	const fallbackIds =
		escalationIds.length > 0
			? escalationIds
			: readChatIds(cfg, "telegramChatId");
	const summaryIds = readChatIds(cfg, "summaryTelegramChatIds");
	const chatIds =
		purpose === "summary" && summaryIds.length > 0
			? summaryIds
			: fallbackIds;
	return chatIds.length > 0 ? { botToken, chatIds } : null;
}

/**
 * Whether the team wants a Telegram alert when a customer is left waiting on
 * a teammate (`teammateWaitAlert` on the `escalate-telegram` config). Off
 * unless switched on: teammates usually answer within the half hour, and the
 * bot answers after that anyway.
 */
export async function teammateWaitAlertEnabled(
	agentId: string,
): Promise<boolean> {
	const { db } = await import("@repo/database");
	const row = await db.aiAgentToolConfig.findFirst({
		where: { agentId, toolId: "escalate-telegram" },
		select: { config: true },
	});
	const cfg = (row?.config ?? {}) as Record<string, unknown>;
	return cfg["teammateWaitAlert"] === "on";
}

/** Escape free text for Telegram's HTML parse mode. */
export function escapeTelegramHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Send one HTML message to the agent's team chats; never throws. */
export async function notifyTeamTelegram(
	agentId: string,
	message: string,
	options: {
		conversationId?: string | null | undefined;
		purpose?: "escalation" | "summary" | undefined;
	} = {},
): Promise<boolean> {
	try {
		const target = await resolveTeamTelegramTarget(
			agentId,
			options.purpose ?? "escalation",
		);
		if (!target) {
			logger.warn("[team-telegram] escalate-telegram not configured", {
				agentId,
			});
			return false;
		}
		const { succeeded } = await sendTelegramMessages(
			target.botToken,
			target.chatIds,
			message,
			options.conversationId ?? "",
		);
		return succeeded > 0;
	} catch (error) {
		logger.error("[team-telegram] send failed", { agentId, error });
		return false;
	}
}

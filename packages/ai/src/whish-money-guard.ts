import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { normalizeLebanesPhone } from "./tools/lib/isp-api-client";

/** Detect Whish Money transfer notification messages */
export function isWhishMoneyMessage(text: string): boolean {
	const lower = text.toLowerCase();
	return (
		lower.includes("whish.money") ||
		(lower.includes("w2w transfer") && lower.includes("sent you"))
	);
}

/** Check if a WhatsApp contact phone matches any active employee */
export async function isEmployeePhone(
	organizationId: string,
	contactPhone: string,
): Promise<boolean> {
	const normalized = normalizeLebanesPhone(contactPhone);
	if (!normalized) {
		return false;
	}

	const employees = await db.employee.findMany({
		where: { organizationId, phone: { not: null }, status: "ACTIVE" },
		select: { phone: true },
	});

	return employees.some(
		(e) => e.phone && normalizeLebanesPhone(e.phone) === normalized,
	);
}

/** Instruction prepended to the message text sent to the LLM */
export const WHISH_MONEY_CONTEXT =
	"[SYSTEM NOTE: The following message is a Whish Money payment transfer notification — NOT a customer support query. " +
	"Acknowledge briefly that the transfer notification was received and that someone from the team will review the transaction and get back to them. " +
	"Do NOT suggest contacting Whish Money support. Do NOT say this is outside your scope. Just acknowledge and reassure.]\n\n";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Fire-and-forget Telegram escalation for Whish Money payment notifications.
 * Loads the escalate-telegram tool config for the agent and sends a payment alert.
 */
export async function sendWhishPaymentEscalation(opts: {
	agentId: string;
	conversationId: string;
	contactName: string | null;
	contactPhone: string | null;
	messageText: string;
}): Promise<void> {
	try {
		const toolConfig = await db.aiAgentToolConfig.findFirst({
			where: { agentId: opts.agentId, toolId: "escalate-telegram" },
			select: { config: true },
		});
		if (!toolConfig) {
			return;
		}

		const cfg = toolConfig.config as Record<string, unknown>;
		const botToken = cfg["telegramBotToken"] as string | undefined;
		const rawChatIds = cfg["telegramChatIds"] as
			| string
			| string[]
			| undefined;

		if (!botToken || !rawChatIds) {
			return;
		}

		const chatIds = Array.isArray(rawChatIds)
			? rawChatIds.map((id) => String(id).trim()).filter(Boolean)
			: rawChatIds
					.split(/[\n,]+/)
					.map((id) => id.trim())
					.filter(Boolean);

		if (chatIds.length === 0) {
			return;
		}

		const displayName = opts.contactName ?? "Unknown";
		const lines: string[] = [
			"💳 <b>Payment Received</b>",
			"",
			`👤 ${escapeHtml(displayName)}`,
		];

		if (opts.contactPhone) {
			lines.push(`📞 ${escapeHtml(opts.contactPhone)}`);
		}

		lines.push(
			"",
			`<blockquote>${escapeHtml(opts.messageText.slice(0, 500))}</blockquote>`,
			"",
			`<code>${escapeHtml(opts.conversationId)}</code>`,
		);

		const message = lines.join("\n");
		const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

		await Promise.allSettled(
			chatIds.map(async (chatId) => {
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: Number(chatId),
						text: message,
						parse_mode: "HTML",
					}),
				});
				if (!response.ok) {
					logger.error(
						`Whish payment escalation failed for chat ${chatId}`,
						{ status: response.status },
					);
				}
			}),
		);
	} catch (error) {
		logger.error("Failed to send Whish payment escalation", { error });
	}
}

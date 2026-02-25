import { logger } from "@repo/logs";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

const PRIORITY_EMOJI: Record<string, string> = {
	high: "🔴",
	medium: "🟡",
	low: "🟢",
};

const escalateTelegramDef = toolDefinition({
	name: "escalate-telegram",
	description:
		"Send an escalation alert to the support team via Telegram when an issue cannot be resolved with available tools. " +
		"Use this when: (1) the issue cannot be resolved after running all available diagnostics, " +
		"(2) the customer explicitly requests to speak with a human, " +
		"(3) an infrastructure-wide outage is confirmed via cross-check pings, " +
		"(4) the issue involves billing, account changes, or hardware problems outside tool scope. " +
		"IMPORTANT: Always run full diagnostics FIRST before escalating — never escalate prematurely. " +
		"Include a thorough summary of all findings in the summary field. " +
		"Set priority: high for outages or critical account issues, medium for unresolved technical issues after full diagnosis, low for general requests the customer wants handled by a human.",
	inputSchema: z.object({
		reason: z
			.string()
			.describe(
				"Why escalation is needed — the specific issue that cannot be resolved",
			),
		priority: z
			.enum(["low", "medium", "high"])
			.describe(
				"low = general requests, medium = unresolved technical issues, high = outages or critical problems",
			),
		summary: z
			.string()
			.describe(
				"Full summary of what was investigated, tools used, and findings so far",
			),
		customerName: z
			.string()
			.optional()
			.describe("Customer name if known from conversation"),
		customerUsername: z
			.string()
			.optional()
			.describe("ISP username if found via search"),
		actionRequired: z
			.string()
			.optional()
			.describe("Specific action the support team should take"),
	}),
});

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function createEscalateTelegramTool(context: ToolContext) {
	return escalateTelegramDef.server(async (args) => {
		try {
			const telegramBotToken = context.toolConfig?.["telegramBotToken"] as
				| string
				| undefined;
			const telegramChatId = context.toolConfig?.["telegramChatId"] as
				| string
				| undefined;

			if (!telegramBotToken || !telegramChatId) {
				return {
					success: false,
					message:
						"Escalation is not configured. Please set up the Telegram Bot Token and Chat ID in the tool settings.",
				};
			}

			// Load conversation and agent info for context
			let contactId: string | null = null;
			let contactName: string | null = null;
			let agentName = "Unknown Agent";

			try {
				const { db } = await import("@repo/database");

				const [conversation, agent] = await Promise.all([
					db.aiConversation.findUnique({
						where: { id: context.conversationId },
						select: { contactId: true, contactName: true },
					}),
					db.aiAgent.findUnique({
						where: { id: context.agentId },
						select: { name: true },
					}),
				]);

				if (conversation) {
					contactId = conversation.contactId;
					contactName = conversation.contactName;
				}
				if (agent) {
					agentName = agent.name;
				}
			} catch (error) {
				logger.error(
					"Failed to load conversation/agent info for escalation",
					{
						error,
						conversationId: context.conversationId,
					},
				);
			}

			const displayName =
				args.customerName ??
				contactName ??
				context.contactName ??
				"Unknown";
			const priorityEmoji = PRIORITY_EMOJI[args.priority] ?? "⚪";

			// Build HTML message
			const lines: string[] = [
				`${priorityEmoji} <b>Escalation — ${args.priority.toUpperCase()}</b>`,
				"",
				`<b>Reason:</b> ${escapeHtml(args.reason)}`,
				"",
				`<b>Customer:</b> ${escapeHtml(displayName)}`,
			];

			if (args.customerUsername) {
				lines.push(
					`<b>ISP Username:</b> <code>${escapeHtml(args.customerUsername)}</code>`,
				);
			}

			if (contactId) {
				const linkName = escapeHtml(displayName);
				lines.push(
					`<b>Telegram:</b> <a href="tg://user?id=${escapeHtml(contactId)}">${linkName}</a>`,
				);
			}

			lines.push("", "<b>Summary of Investigation:</b>");
			lines.push(escapeHtml(args.summary));

			if (args.actionRequired) {
				lines.push(
					"",
					`<b>Action Required:</b> ${escapeHtml(args.actionRequired)}`,
				);
			}

			lines.push(
				"",
				`<b>Agent:</b> ${escapeHtml(agentName)}`,
				`<b>Conversation:</b> <code>${escapeHtml(context.conversationId)}</code>`,
			);

			const message = lines.join("\n");

			// Send via grammy Api
			const { Api } = await import("grammy");
			const api = new Api(telegramBotToken);
			await api.sendMessage(Number(telegramChatId), message, {
				parse_mode: "HTML",
			});

			return {
				success: true,
				message: `Escalation alert sent to the support team with priority ${args.priority}. The team has been notified with full diagnostic details.`,
			};
		} catch (error) {
			logger.error("Telegram escalation failed", {
				error,
				conversationId: context.conversationId,
			});
			return {
				success: false,
				message: `Failed to send escalation alert: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	});
}

export const escalateTelegram: RegisteredTool = {
	metadata: {
		id: "escalate-telegram",
		name: "Escalate to Telegram",
		description:
			"Send an escalation alert with full context to a Telegram support group or person",
		category: "customer",
		requiresConfig: true,
		configFields: [
			{
				key: "telegramBotToken",
				label: "Telegram Bot Token",
				type: "password",
				required: true,
				placeholder: "123456:ABC-DEF...",
			},
			{
				key: "telegramChatId",
				label: "Telegram Chat ID",
				type: "text",
				required: true,
				placeholder: "-1001234567890 (group) or 123456789 (user)",
			},
		],
	},
	factory: createEscalateTelegramTool,
};

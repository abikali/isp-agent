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

interface CustomerDetails {
	fullName: string;
	phone: string | null;
	email: string | null;
	username: string | null;
	address: string | null;
	accountNumber: string;
	status: string;
	planName: string | null;
	stationName: string | null;
}

function parseChatIds(raw: string): string[] {
	return raw
		.split(/[\n,]+/)
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

function createEscalateTelegramTool(context: ToolContext) {
	return escalateTelegramDef.server(async (args) => {
		try {
			const telegramBotToken = context.toolConfig?.["telegramBotToken"] as
				| string
				| undefined;
			const telegramChatIds = context.toolConfig?.["telegramChatIds"] as
				| string
				| undefined;

			// Backwards compatibility: fall back to old single-value key
			const rawChatIds =
				telegramChatIds ??
				(context.toolConfig?.["telegramChatId"] as string | undefined);

			if (!telegramBotToken || !rawChatIds) {
				return {
					success: false,
					message:
						"Escalation is not configured. Please set up the Telegram Bot Token and Chat IDs in the tool settings.",
				};
			}

			const chatIds = parseChatIds(rawChatIds);
			if (chatIds.length === 0) {
				return {
					success: false,
					message:
						"No valid Telegram Chat IDs configured. Please add at least one Chat ID in the tool settings.",
				};
			}

			// Load conversation, agent info, and verified customer details
			let contactId: string | null = null;
			let contactName: string | null = null;
			let agentName = "Unknown Agent";
			let customer: CustomerDetails | null = null;

			try {
				const { db } = await import("@repo/database");

				const [conversation, agent] = await Promise.all([
					db.aiConversation.findUnique({
						where: { id: context.conversationId },
						select: {
							contactId: true,
							contactName: true,
							verifiedCustomerId: true,
						},
					}),
					db.aiAgent.findUnique({
						where: { id: context.agentId },
						select: { name: true },
					}),
				]);

				if (conversation) {
					contactId = conversation.contactId;
					contactName = conversation.contactName;

					// Fetch verified customer details if available
					if (conversation.verifiedCustomerId) {
						const dbCustomer = await db.customer.findUnique({
							where: { id: conversation.verifiedCustomerId },
							select: {
								fullName: true,
								phone: true,
								email: true,
								username: true,
								address: true,
								accountNumber: true,
								status: true,
								plan: { select: { name: true } },
								station: { select: { name: true } },
							},
						});

						if (dbCustomer) {
							customer = {
								fullName: dbCustomer.fullName,
								phone: dbCustomer.phone,
								email: dbCustomer.email,
								username: dbCustomer.username,
								address: dbCustomer.address,
								accountNumber: dbCustomer.accountNumber,
								status: dbCustomer.status,
								planName: dbCustomer.plan?.name ?? null,
								stationName: dbCustomer.station?.name ?? null,
							};
						}
					}
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
				customer?.fullName ??
				contactName ??
				context.contactName ??
				"Unknown";
			const priorityEmoji = PRIORITY_EMOJI[args.priority] ?? "⚪";

			// Build HTML message
			const lines: string[] = [
				`${priorityEmoji} <b>Escalation — ${args.priority.toUpperCase()}</b>`,
				"",
				`<b>Reason:</b> ${escapeHtml(args.reason)}`,
			];

			// Customer details section
			lines.push("", `<b>Customer:</b> ${escapeHtml(displayName)}`);

			if (customer) {
				lines.push(
					`<b>Account #:</b> <code>${escapeHtml(customer.accountNumber)}</code>`,
				);
				if (customer.username) {
					lines.push(
						`<b>ISP Username:</b> <code>${escapeHtml(customer.username)}</code>`,
					);
				}
				if (customer.phone) {
					lines.push(`<b>Phone:</b> ${escapeHtml(customer.phone)}`);
				}
				if (customer.email) {
					lines.push(`<b>Email:</b> ${escapeHtml(customer.email)}`);
				}
				if (customer.address) {
					lines.push(
						`<b>Address:</b> ${escapeHtml(customer.address)}`,
					);
				}
				if (customer.planName) {
					lines.push(`<b>Plan:</b> ${escapeHtml(customer.planName)}`);
				}
				if (customer.stationName) {
					lines.push(
						`<b>Station:</b> ${escapeHtml(customer.stationName)}`,
					);
				}
				lines.push(`<b>Status:</b> ${escapeHtml(customer.status)}`);
			} else {
				// Fall back to tool-provided username if no verified customer
				if (args.customerUsername) {
					lines.push(
						`<b>ISP Username:</b> <code>${escapeHtml(args.customerUsername)}</code>`,
					);
				}
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

			// Send to all configured chat IDs
			const { Api } = await import("grammy");
			const api = new Api(telegramBotToken);

			const results: Array<{
				chatId: string;
				success: boolean;
				error?: string;
			}> = [];

			await Promise.allSettled(
				chatIds.map(async (chatId) => {
					try {
						await api.sendMessage(Number(chatId), message, {
							parse_mode: "HTML",
						});
						results.push({ chatId, success: true });
					} catch (error) {
						const errorMsg =
							error instanceof Error
								? error.message
								: "Unknown error";
						logger.error(
							`Telegram escalation failed for chat ${chatId}`,
							{ error, conversationId: context.conversationId },
						);
						results.push({
							chatId,
							success: false,
							error: errorMsg,
						});
					}
				}),
			);

			const succeeded = results.filter((r) => r.success).length;
			const failed = results.filter((r) => !r.success);

			if (succeeded === 0) {
				return {
					success: false,
					message: `Failed to send escalation alert to all ${chatIds.length} recipients. Errors: ${failed.map((f) => `${f.chatId}: ${f.error}`).join("; ")}`,
				};
			}

			if (failed.length > 0) {
				return {
					success: true,
					message: `Escalation alert sent to ${succeeded}/${chatIds.length} recipients with priority ${args.priority}. Failed: ${failed.map((f) => f.chatId).join(", ")}`,
				};
			}

			return {
				success: true,
				message: `Escalation alert sent to ${succeeded} recipient${succeeded > 1 ? "s" : ""} with priority ${args.priority}. The team has been notified with full diagnostic details.`,
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
				key: "telegramChatIds",
				label: "Telegram Chat IDs",
				type: "textarea",
				required: true,
				placeholder: "-1001234567890\n123456789\n-1009876543210",
				description:
					"One Chat ID per line. Supports group IDs (e.g. -1001234567890) and user IDs (e.g. 123456789).",
			},
		],
	},
	factory: createEscalateTelegramTool,
};

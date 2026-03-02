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
		"Send a real Telegram message to the support/sales team. Returns success/failure status.",
	inputSchema: z.object({
		reason: z
			.string()
			.describe(
				"Brief reason — e.g. 'New subscription request', 'Service relocation', 'Unresolved connectivity issue'",
			),
		priority: z
			.enum(["low", "medium", "high"])
			.describe(
				"low = general inquiries, medium = sales leads and unresolved technical issues, high = outages or critical problems",
			),
		summary: z
			.string()
			.describe(
				"A concise summary of the entire conversation for the team: what the customer wanted or reported, what you did (diagnostics, lookups, actions taken), the current status, and why this is being escalated. Include customer name, phone number, location, and any diagnostic findings.",
			),
		customerName: z.string().optional().describe("Customer name if known"),
		customerUsername: z
			.string()
			.optional()
			.describe("ISP username if found via search"),
		actionRequired: z
			.string()
			.optional()
			.describe(
				"What the team should do — e.g. 'Call customer to discuss subscription plans', 'Check coverage in Dekwane area'",
			),
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

function parseChatIds(raw: string | string[]): string[] {
	if (Array.isArray(raw)) {
		return raw.map((id) => String(id).trim()).filter((id) => id.length > 0);
	}
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
				| string[]
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
			const { Api, GrammyError, HttpError } = await import("grammy");
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
						let errorMsg = "Unknown error";
						if (error instanceof GrammyError) {
							if (error.error_code === 403) {
								errorMsg = `Bot blocked or user hasn't started chat (403)`;
							} else if (error.error_code === 400) {
								errorMsg = "Chat not found (400)";
							} else {
								errorMsg = error.description;
							}
						} else if (error instanceof HttpError) {
							errorMsg = "Network error reaching Telegram";
						} else if (error instanceof Error) {
							errorMsg = error.message;
						}
						logger.error(
							`Telegram escalation failed for chat ${chatId}: ${errorMsg}`,
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
					message: `Escalation sent to ${succeeded}/${chatIds.length} recipients (priority: ${args.priority}). Failed: ${failed.map((f) => f.chatId).join(", ")}. You can now confirm to the customer that their request has been forwarded.`,
				};
			}

			return {
				success: true,
				message: `Escalation sent successfully to ${succeeded} recipient${succeeded > 1 ? "s" : ""} (priority: ${args.priority}). You can now confirm to the customer that their request has been forwarded.`,
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
			"Notify the team via Telegram — for sales leads, support escalations, and any human follow-up",
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
				type: "repeater",
				required: true,
				placeholder: "e.g. 123456789 or -1001234567890",
				description:
					"Supports group IDs (e.g. -1001234567890) and user IDs (e.g. 123456789). Each recipient must have started a conversation with the bot.",
			},
		],
	},
	factory: createEscalateTelegramTool,
};

import { logger } from "@repo/logs";
import { tool } from "ai";
import { z } from "zod";
import { summarizeForEscalation } from "../escalation-summary";
import { cleanPhoneNumber, ispGet } from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

const PRIORITY_EMOJI: Record<string, string> = {
	high: "🔴",
	medium: "🟡",
	low: "🟢",
};

const PRIORITY_LABEL: Record<string, string> = {
	high: "URGENT",
	medium: "MEDIUM",
	low: "LOW",
};

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

interface CustomerDetails {
	fullName: string | null;
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

// ---------------------------------------------------------------------------
// Telegram message builder
// ---------------------------------------------------------------------------

function buildConversationExcerpt(
	messages: Array<{ role: string; content: string }>,
	maxChars = 600,
): string {
	const recent = messages.slice(-6);
	const lines: string[] = [];
	let totalChars = 0;

	for (const msg of recent) {
		const prefix = msg.role === "user" ? "C" : "A";
		const content = msg.content.slice(0, 150).replace(/\n/g, " ");
		const line = `${prefix}: ${content}`;
		if (totalChars + line.length > maxChars) {
			break;
		}
		lines.push(line);
		totalChars += line.length;
	}

	return lines.join("\n");
}

function buildTelegramMessage(opts: {
	priority: string;
	category: string;
	displayName: string;
	customer: CustomerDetails | null;
	ispCustomer: IspCustomerInfo | null;
	customerUsername: string | undefined;
	contactId: string | null;
	contactPhone: string | null;
	summary: string;
	actionRequired: string | undefined;
	conversationExcerpt: string;
	conversationId: string;
}): string {
	const emoji = PRIORITY_EMOJI[opts.priority] ?? "⚪";
	const priorityLabel =
		PRIORITY_LABEL[opts.priority] ?? opts.priority.toUpperCase();
	const categoryLabel =
		opts.category.charAt(0).toUpperCase() + opts.category.slice(1);

	const lines: string[] = [
		`${emoji} <b>${priorityLabel}</b> — ${categoryLabel}`,
		"",
	];

	// Customer identity line — merge DB customer, ISP lookup, and agent-provided data
	const nameParts: string[] = [escapeHtml(opts.displayName)];
	const username =
		opts.customer?.username ??
		opts.ispCustomer?.userName ??
		opts.customerUsername;
	if (username) {
		nameParts.push(`· <code>${escapeHtml(username)}</code>`);
	}
	lines.push(`👤 ${nameParts.join(" ")}`);

	// Contact info line — prefer verified customer, then ISP lookup, then WhatsApp
	const phone = opts.customer?.phone ?? opts.contactPhone;
	const address = opts.customer?.address ?? opts.ispCustomer?.address;
	const contactParts: string[] = [];
	if (phone) {
		contactParts.push(escapeHtml(phone));
	}
	if (address) {
		contactParts.push(escapeHtml(address));
	}
	if (contactParts.length > 0) {
		lines.push(`📞 ${contactParts.join(" · ")}`);
	}

	// Plan / status line — merge DB and ISP data
	const planParts: string[] = [];
	if (opts.customer?.planName) {
		planParts.push(escapeHtml(opts.customer.planName));
	} else if (opts.ispCustomer?.accountTypeName) {
		planParts.push(escapeHtml(opts.ispCustomer.accountTypeName));
	}
	if (opts.customer) {
		planParts.push(escapeHtml(opts.customer.status));
	} else if (opts.ispCustomer) {
		// Build status from ISP fields
		if (opts.ispCustomer.blocked) {
			planParts.push("BLOCKED");
		} else if (opts.ispCustomer.active === false) {
			planParts.push("INACTIVE");
		} else if (opts.ispCustomer.online) {
			planParts.push("Online");
		} else if (opts.ispCustomer.online === false) {
			planParts.push("Offline");
		}
	}
	if (opts.ispCustomer?.stationName && !opts.customer?.stationName) {
		planParts.push(escapeHtml(opts.ispCustomer.stationName));
	}
	if (planParts.length > 0) {
		lines.push(`📋 ${planParts.join(" · ")}`);
	}

	// LLM summary
	lines.push("", escapeHtml(opts.summary));

	// Action required
	if (opts.actionRequired) {
		lines.push("", `⚡ <b>Action:</b> ${escapeHtml(opts.actionRequired)}`);
	}

	// Raw conversation excerpt
	if (opts.conversationExcerpt) {
		lines.push(
			"",
			`<blockquote>${escapeHtml(opts.conversationExcerpt)}</blockquote>`,
		);
	}

	// Conversation ID (small reference at the bottom)
	lines.push("", `<code>${escapeHtml(opts.conversationId)}</code>`);

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Telegram send helper
// ---------------------------------------------------------------------------

async function sendTelegramMessages(
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

// ---------------------------------------------------------------------------
// ISP API customer lookup (enrichment for escalations)
// ---------------------------------------------------------------------------

interface IspCustomerInfo {
	userName: string | null;
	fullName: string | null;
	address: string | null;
	online: boolean | null;
	active: boolean | null;
	blocked: boolean | null;
	stationName: string | null;
	accountTypeName: string | null;
}

/**
 * Quick ISP API lookup by phone number to enrich escalation messages.
 * Returns null if no ISP config, no phone, or the API returns nothing.
 * Never throws — failures are silently ignored.
 */
async function lookupIspCustomer(
	agentId: string,
	phone: string | null,
): Promise<IspCustomerInfo | null> {
	if (!phone) {
		return null;
	}

	try {
		const { db } = await import("@repo/database");

		// Load ISP API config from any ISP tool config on this agent
		const ispToolConfig = await db.aiAgentToolConfig.findFirst({
			where: {
				agentId,
				toolId: {
					in: ["isp-search-customer", "isp-diagnose-customer"],
				},
			},
			select: { config: true },
		});

		if (!ispToolConfig) {
			return null;
		}

		const cfg = ispToolConfig.config as Record<string, unknown>;
		const baseUrl = cfg["ispBaseUrl"] as string | undefined;
		const userName = cfg["ispUsername"] as string | undefined;
		const password = cfg["ispPassword"] as string | undefined;

		if (!baseUrl || !userName || !password) {
			return null;
		}

		const query = cleanPhoneNumber(phone);
		const data = await ispGet<
			Record<string, unknown> | Record<string, unknown>[] | null
		>(
			{ baseUrl: baseUrl.replace(/\/+$/, ""), userName, password },
			"/user-info",
			{ mobile: query },
		);

		if (!data) {
			return null;
		}

		const customer = Array.isArray(data) ? data[0] : data;
		if (!customer) {
			return null;
		}

		return {
			userName: (customer["userName"] as string) ?? null,
			fullName:
				[customer["firstName"], customer["lastName"]]
					.filter(Boolean)
					.join(" ") || null,
			address: (customer["address"] as string) ?? null,
			online:
				customer["online"] != null ? Boolean(customer["online"]) : null,
			active:
				customer["active"] != null ? Boolean(customer["active"]) : null,
			blocked:
				customer["blocked"] != null
					? Boolean(customer["blocked"])
					: null,
			stationName: (customer["stationName"] as string) ?? null,
			accountTypeName: (customer["accountTypeName"] as string) ?? null,
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Task creation / dedup
// ---------------------------------------------------------------------------

const TASK_PRIORITY_MAP: Record<string, string> = {
	low: "LOW",
	medium: "MEDIUM",
	high: "URGENT",
};

const TASK_CATEGORY_MAP: Record<string, string> = {
	installation: "INSTALLATION",
	maintenance: "MAINTENANCE",
	repair: "REPAIR",
	support: "SUPPORT",
	billing: "BILLING",
	general: "GENERAL",
};

type TaskCategory =
	| "INSTALLATION"
	| "MAINTENANCE"
	| "REPAIR"
	| "SUPPORT"
	| "BILLING"
	| "GENERAL";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

async function createOrUpdateEscalationTask(
	context: ToolContext,
	data: {
		summary: string;
		priority: string;
		category: string;
		actionRequired?: string | undefined;
	},
	verifiedCustomerId: string | null,
) {
	const { db } = await import("@repo/database");

	const agent = await db.aiAgent.findUnique({
		where: { id: context.agentId },
		select: { organizationId: true },
	});
	if (!agent) {
		return;
	}

	const title = `AI Escalation: ${data.summary.slice(0, 200)}`.slice(0, 500);
	const descriptionParts = [data.summary];
	if (data.actionRequired) {
		descriptionParts.push(`\nAction Required: ${data.actionRequired}`);
	}
	const description = descriptionParts.join("\n").slice(0, 5000);
	const priority = TASK_PRIORITY_MAP[data.priority] ?? "MEDIUM";
	const category = TASK_CATEGORY_MAP[data.category] ?? "SUPPORT";

	// Dedup: update existing open task for this conversation (1-hour window)
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	const existingTask = await db.task.findFirst({
		where: {
			conversationId: context.conversationId,
			status: "OPEN",
			createdAt: { gte: oneHourAgo },
		},
		select: { id: true },
	});

	if (existingTask) {
		await db.task.update({
			where: { id: existingTask.id },
			data: {
				title,
				description,
				priority: priority as TaskPriority,
				category: category as TaskCategory,
			},
		});
	} else {
		await db.task.create({
			data: {
				organizationId: agent.organizationId,
				title,
				description,
				priority: priority as TaskPriority,
				status: "OPEN",
				category: category as TaskCategory,
				source: "AI_ESCALATION",
				createdById: null,
				customerId: verifiedCustomerId,
				conversationId: context.conversationId,
			},
		});
	}
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

function createEscalateTelegramTool(context: ToolContext) {
	return tool({
		description:
			"Send a real Telegram message to the support/sales team. Returns success/failure status. " +
			"Call this ONCE per issue: if you already escalated this issue in this conversation, do NOT " +
			"call again for follow-up messages, thanks, acknowledgments, or repeated complaints about the " +
			"same problem — tell the customer the team is already notified. Only call again when the " +
			"customer raises a genuinely NEW issue or provides materially new information the team needs.",
		inputSchema: z.object({
			reason: z
				.string()
				.describe(
					"Brief reason — e.g. 'New subscription request', 'Service relocation', 'Unresolved connectivity issue'",
				),
			priority: z
				.enum(["low", "medium", "high"])
				.describe(
					"low = general inquiries and routine requests, medium = sales leads, follow-ups, and unresolved technical issues (the default for most escalations), high = RESERVED for total outages, safety issues, or many customers affected — most escalations are NOT high",
				),
			summary: z
				.string()
				.describe(
					"A concise summary of the entire conversation for the team: what the customer wanted or reported, what you did (diagnostics, lookups, actions taken), the current status, and why this is being escalated. Include customer name, phone number, location, and any diagnostic findings.",
				),
			customerName: z
				.string()
				.optional()
				.describe("Customer name if known"),
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
			category: z
				.enum([
					"installation",
					"maintenance",
					"repair",
					"support",
					"billing",
					"general",
				])
				.describe(
					"Task category: installation = new setup, maintenance = scheduled/requested maintenance, repair = broken equipment or line fix, support = general tech support, billing = payment or invoice issues, general = anything else",
				),
		}),
		execute: async (args) => {
			try {
				// ---- Validate Telegram config ----
				const telegramBotToken = context.toolConfig?.[
					"telegramBotToken"
				] as string | undefined;
				const rawChatIds =
					(context.toolConfig?.["telegramChatIds"] as
						| string
						| string[]
						| undefined) ??
					(context.toolConfig?.["telegramChatId"] as
						| string
						| undefined);

				if (!telegramBotToken || !rawChatIds) {
					logger.error(
						"escalate-telegram: Missing bot token or chat IDs",
						{
							agentId: context.agentId,
							conversationId: context.conversationId,
						},
					);
					return {
						success: false,
						message:
							"ESCALATION FAILED — Telegram is not configured. DO NOT tell the customer their request was forwarded. Instead, apologize and ask them to contact support directly.",
					};
				}

				const chatIds = parseChatIds(rawChatIds);
				if (chatIds.length === 0) {
					return {
						success: false,
						message:
							"ESCALATION FAILED — no valid Telegram Chat IDs configured. DO NOT tell the customer their request was forwarded.",
					};
				}

				const { db } = await import("@repo/database");

				// ---- Telegram dedup: skip send if escalated in last 10 min ----
				const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
				const recentEscalation = await db.task.findFirst({
					where: {
						conversationId: context.conversationId,
						source: "AI_ESCALATION",
						createdAt: { gte: tenMinutesAgo },
					},
					select: { id: true },
				});

				if (recentEscalation) {
					// Update the task with latest info, but don't spam Telegram
					createOrUpdateEscalationTask(
						context,
						{
							summary: args.summary,
							priority: args.priority,
							category: args.category,
							actionRequired: args.actionRequired,
						},
						null,
					).catch((err) =>
						logger.error("Failed to update escalation task", {
							error: err,
						}),
					);

					return {
						success: true,
						message:
							"Escalation already active for this conversation — task updated with latest info. You can confirm to the customer that the team is already aware.",
					};
				}

				// ---- Load conversation, customer, and recent messages ----
				let contactId: string | null = null;
				let contactName: string | null = null;
				let customer: CustomerDetails | null = null;
				let verifiedCustomerId: string | null = null;
				let conversationMessages: Array<{
					role: string;
					content: string;
				}> = [];

				try {
					const [conversation, recentMessages] = await Promise.all([
						db.aiConversation.findUnique({
							where: { id: context.conversationId },
							select: {
								contactId: true,
								contactName: true,
								verifiedCustomerId: true,
							},
						}),
						db.aiMessage.findMany({
							where: {
								conversationId: context.conversationId,
							},
							orderBy: { createdAt: "desc" },
							take: 15,
							select: { role: true, content: true },
						}),
					]);

					conversationMessages = recentMessages.reverse();

					if (conversation) {
						contactId = conversation.contactId;
						contactName = conversation.contactName;
						verifiedCustomerId = conversation.verifiedCustomerId;

						if (conversation.verifiedCustomerId) {
							const dbCustomer = await db.customer.findUnique({
								where: {
									id: conversation.verifiedCustomerId,
								},
								select: {
									firstName: true,
									lastName: true,
									phone: true,
									email: true,
									username: true,
									address: true,
									accountNumber: true,
									status: true,
									plan: {
										select: { name: true },
									},
									station: {
										select: { name: true },
									},
								},
							});

							if (dbCustomer) {
								customer = {
									fullName:
										[
											dbCustomer.firstName,
											dbCustomer.lastName,
										]
											.filter(Boolean)
											.join(" ") || null,
									phone: dbCustomer.phone,
									email: dbCustomer.email,
									username: dbCustomer.username,
									address: dbCustomer.address,
									accountNumber: dbCustomer.accountNumber,
									status: dbCustomer.status,
									planName: dbCustomer.plan?.name ?? null,
									stationName:
										dbCustomer.station?.name ?? null,
								};
							}
						}
					}
				} catch (error) {
					logger.error(
						"Failed to load conversation data for escalation",
						{
							error,
							conversationId: context.conversationId,
						},
					);
				}

				// ---- ISP API lookup when no verified customer ----
				let ispCustomer: IspCustomerInfo | null = null;
				if (!customer && contactId) {
					ispCustomer = await lookupIspCustomer(
						context.agentId,
						contactId,
					);
				}

				const displayName =
					args.customerName ??
					customer?.fullName ??
					ispCustomer?.fullName ??
					contactName ??
					context.contactName ??
					"Unknown";

				// ---- LLM summary (fall back to agent args on failure) ----
				const llmSummary = await summarizeForEscalation({
					conversationMessages,
					customerName: displayName,
					customerPhone: customer?.phone ?? undefined,
					agentHints: {
						reason: args.reason,
						summary: args.summary,
						priority: args.priority,
						category: args.category,
						actionRequired: args.actionRequired,
					},
				});

				const finalSummary = llmSummary?.summary ?? args.summary;
				const finalPriority = llmSummary?.priority ?? args.priority;
				const finalCategory = llmSummary?.category ?? args.category;
				const finalAction =
					llmSummary?.actionRequired ?? args.actionRequired;

				// ---- Build and send Telegram message ----
				const excerpt = buildConversationExcerpt(conversationMessages);

				const message = buildTelegramMessage({
					priority: finalPriority,
					category: finalCategory,
					displayName,
					customer,
					ispCustomer,
					customerUsername: args.customerUsername,
					contactId,
					contactPhone: contactId,
					summary: finalSummary,
					actionRequired: finalAction,
					conversationExcerpt: excerpt,
					conversationId: context.conversationId,
				});

				const { succeeded, failed } = await sendTelegramMessages(
					telegramBotToken,
					chatIds,
					message,
					context.conversationId,
				);

				// ---- Create/update dashboard task ----
				if (succeeded > 0) {
					createOrUpdateEscalationTask(
						context,
						{
							summary: finalSummary,
							priority: finalPriority,
							category: finalCategory,
							actionRequired: finalAction,
						},
						verifiedCustomerId,
					).catch((err) =>
						logger.error(
							"Failed to create/update escalation task",
							{ error: err },
						),
					);
				}

				// ---- Return result to the agent ----
				if (succeeded === 0) {
					return {
						success: false,
						message: `ESCALATION FAILED — could not send to any of ${chatIds.length} recipients. Errors: ${failed.join(", ")}. DO NOT tell the customer their request was forwarded.`,
					};
				}

				if (failed.length > 0) {
					return {
						success: true,
						message: `Escalation sent to ${succeeded}/${chatIds.length} recipients (priority: ${finalPriority}). You can now confirm to the customer that their request has been forwarded.`,
					};
				}

				return {
					success: true,
					message: `Escalation sent successfully to ${succeeded} recipient${succeeded > 1 ? "s" : ""} (priority: ${finalPriority}). You can now confirm to the customer that their request has been forwarded.`,
				};
			} catch (error) {
				logger.error("Telegram escalation failed", {
					error,
					conversationId: context.conversationId,
				});
				return {
					success: false,
					message: `ESCALATION FAILED: ${error instanceof Error ? error.message : "Unknown error"}. DO NOT tell the customer their request was forwarded.`,
				};
			}
		},
	});
}

// ---------------------------------------------------------------------------
// Registered tool export
// ---------------------------------------------------------------------------

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
	defaultPromptSection: `## Escalation via Telegram

Calling escalate-telegram sends a REAL Telegram message to the support/sales team.
Text like "I will forward" does nothing — you MUST call the tool.

### How to escalate

1. For URGENT cases (outages, explicit "transfer me" requests, frustrated customers) — escalate IMMEDIATELY with whatever info you have.
2. For NON-URGENT cases (subscriptions, sales, plan changes, general inquiries) — first ask the customer for key details (location, what they need, contact info) so the team gets a complete picture. Then escalate once you have a reasonable amount of info. Do NOT ask more than 2-3 questions — avoid interrogating the customer.
3. Call escalate-telegram with a summary including your findings.
4. ONLY confirm to the customer AFTER the tool returns success=true.
5. If the tool returns success=false, DO NOT tell the customer you forwarded their request. Instead apologize and ask them to call support directly.

### When you MUST escalate (call the tool — do not just say you will):
- Customer explicitly asks for human help or to be transferred
- Customer wants to cancel, stop, or change their service
- Customer is not found in the system (potential new lead or unregistered number)
- Customer is frustrated and you cannot resolve their issue
- New subscription or sales inquiry requiring human follow-up
- Any request you cannot fulfill yourself (plan changes, billing, cancellations)

### Re-escalation with updated info
If you already escalated earlier in the conversation but the customer later provides important NEW information (e.g. location, phone number, specific plan preference), call escalate-telegram AGAIN with an updated summary that includes the new details. The team benefits from having the latest info. Do NOT skip re-escalation just because you escalated before — each call sends a separate message to the team.

IMPORTANT: Do NOT refuse to escalate because you lack account details. The team can look up and verify the customer themselves. Missing info is NEVER a reason to block escalation. Include whatever you have (name, phone number from the chat, the customer's own description) and let the team handle the rest.

Priority levels:
- **high**: outages, critical issues
- **medium**: sales, cancellations, unresolved tech issues
- **low**: general inquiries`,
};

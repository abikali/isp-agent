import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";
import { tool } from "ai";
import { z } from "zod";
import { resolveContactCustomer } from "../contact-customer";
import { summarizeForEscalation } from "../escalation-summary";
import { type DbMessageRow, selectHistoryWindow } from "../history";
import {
	buildEscalationMessage,
	type CustomerDetails,
	escalationSourceFromToolCallId,
	type IspCustomerInfo,
} from "./lib/escalation-message";
import { lookupCustomerByContactPhone } from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

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

/**
 * Quick ISP API lookup by phone number to enrich escalation messages.
 * Returns null if no ISP config, no phone, or the phone does not match
 * exactly one iRadius account — a substring search on a shared or short
 * number used to put a stranger's name on the escalation.
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

		const customer = await lookupCustomerByContactPhone(
			{ baseUrl: baseUrl.replace(/\/+$/, ""), userName, password },
			phone,
		);
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

async function loadCustomerDetails(
	customerId: string,
): Promise<CustomerDetails | null> {
	const { db } = await import("@repo/database");
	const dbCustomer = await db.customer.findUnique({
		where: { id: customerId },
		select: {
			firstName: true,
			lastName: true,
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
	if (!dbCustomer) {
		return null;
	}
	return {
		fullName:
			[dbCustomer.firstName, dbCustomer.lastName]
				.filter(Boolean)
				.join(" ") || null,
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
		execute: async (args, options) => {
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

				const source = escalationSourceFromToolCallId(
					options?.toolCallId,
				);
				const now = new Date();

				// ---- Load conversation, customer, and recent messages ----
				let contactId: string | null = null;
				let contactName: string | null = null;
				let customer: CustomerDetails | null = null;
				let customerMatch: "verified" | "phone" | null = null;
				let verifiedCustomerId: string | null = null;
				let organizationSlug: string | null = null;
				let historyRows: DbMessageRow[] = [];

				try {
					const { loadHistoryRows } = await import(
						"../history-loader"
					);
					const [conversation, recentMessages] = await Promise.all([
						db.aiConversation.findUnique({
							where: { id: context.conversationId },
							select: {
								contactId: true,
								contactName: true,
								verifiedCustomerId: true,
								agent: {
									select: {
										organizationId: true,
										organization: {
											select: { slug: true },
										},
									},
								},
							},
						}),
						loadHistoryRows(context.conversationId, 15),
					]);

					// Same cut the reply model gets: a chat revived after a
					// long silence must not summarise the old exchange.
					historyRows =
						selectHistoryWindow(recentMessages, { now })?.rows ??
						recentMessages;

					if (conversation) {
						contactId = conversation.contactId;
						contactName = conversation.contactName;
						verifiedCustomerId = conversation.verifiedCustomerId;
						organizationSlug = conversation.agent.organization.slug;

						if (conversation.verifiedCustomerId) {
							customer = await loadCustomerDetails(
								conversation.verifiedCustomerId,
							);
							customerMatch = customer ? "verified" : null;
						} else if (conversation.contactId) {
							// Identity only — a phone match on a PENDING or
							// stopped account is shown to the team but never
							// verifies the conversation.
							const match = await resolveContactCustomer(
								conversation.agent.organizationId,
								conversation.contactId,
							);
							if (match) {
								customer = await loadCustomerDetails(match.id);
								customerMatch = customer ? "phone" : null;
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

				// ---- ISP API lookup when no customer on file ----
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

				// ---- LLM summary ----
				// The caller's priority and category are final: the
				// summariser used to override them and turned most
				// "medium" escalations into URGENT tasks. It only rewrites
				// the summary and the action. The safety net already ran
				// the summariser to build its args, so it is not run twice.
				const llmSummary =
					source === "safety-net"
						? null
						: await summarizeForEscalation({
								credentials: context.credentials,
								conversationMessages: historyRows.map(
									(row) => ({
										role: row.role,
										content: row.content,
									}),
								),
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

				if (
					llmSummary &&
					(llmSummary.priority !== args.priority ||
						llmSummary.category !== args.category)
				) {
					logger.info("escalation-priority-disagreement", {
						conversationId: context.conversationId,
						source,
						callerPriority: args.priority,
						summaryPriority: llmSummary.priority,
						callerCategory: args.category,
						summaryCategory: llmSummary.category,
					});
				}

				const finalSummary = llmSummary?.summary ?? args.summary;
				const finalPriority = args.priority;
				const finalCategory = args.category;
				const finalAction =
					llmSummary?.actionRequired ?? args.actionRequired;

				// ---- Build and send Telegram message ----
				const message = buildEscalationMessage({
					priority: finalPriority,
					category: finalCategory,
					reason: args.reason,
					source,
					displayName,
					customer,
					customerMatch,
					ispCustomer,
					customerUsername: args.customerUsername,
					contactPhone: contactId,
					summary: finalSummary,
					actionRequired: finalAction,
					rows: historyRows,
					conversationId: context.conversationId,
					conversationUrl: organizationSlug
						? `${getBaseUrl()}/app/${organizationSlug}/conversations/${context.conversationId}`
						: null,
					now,
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

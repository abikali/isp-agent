import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";
import { tool } from "ai";
import { z } from "zod";
import { resolveContactCustomer } from "../contact-customer";
import { type FollowUpWindow, resolveFollowUpFireAt } from "../follow-up";
import { type DbMessageRow, selectHistoryWindow } from "../history";
import { parseChatIds, sendTelegramMessages } from "../telegram-send";
import {
	buildEscalationMessage,
	type CustomerDetails,
	type EscalationSource,
	escalationSourceFromToolCallId,
	type IspCustomerInfo,
} from "./lib/escalation-message";
import { lookupCustomerByContactPhone } from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

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

interface EscalationTaskData {
	summary: string;
	priority: string;
	category: string;
	actionRequired?: string | undefined;
}

function escalationTaskFields(data: EscalationTaskData) {
	const title = `AI Escalation: ${data.summary.slice(0, 200)}`.slice(0, 500);
	const descriptionParts = [data.summary];
	if (data.actionRequired) {
		descriptionParts.push(`\nAction Required: ${data.actionRequired}`);
	}
	return {
		title,
		description: descriptionParts.join("\n").slice(0, 5000),
		priority: (TASK_PRIORITY_MAP[data.priority] ??
			"MEDIUM") as TaskPriority,
		category: (TASK_CATEGORY_MAP[data.category] ??
			"SUPPORT") as TaskCategory,
	};
}

async function createOrUpdateEscalationTask(
	context: ToolContext,
	data: EscalationTaskData,
	verifiedCustomerId: string | null,
) {
	const { db } = await import("@repo/database");

	const agent = await db.aiAgent.findUnique({
		where: { id: context.agentId },
		select: {
			organizationId: true,
			postEscalationCheckMinutes: true,
			followUpWindowStart: true,
			followUpWindowEnd: true,
		},
	});
	if (!agent) {
		return;
	}

	const fields = escalationTaskFields(data);

	// Dedup: the customer just answered a check-back ("still not solved"),
	// so this is the same issue — update the task the check-back was about.
	// Otherwise update an open task for this conversation (1-hour window).
	const checkBackTask = await findCheckBackLinkedTask(context.conversationId);
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	const existingTask =
		checkBackTask ??
		(await db.task.findFirst({
			where: {
				conversationId: context.conversationId,
				status: "OPEN",
				createdAt: { gte: oneHourAgo },
			},
			select: { id: true },
		}));

	if (existingTask) {
		await db.task.update({
			where: { id: existingTask.id },
			data: fields,
		});
	} else {
		const task = await db.task.create({
			data: {
				organizationId: agent.organizationId,
				...fields,
				status: "OPEN",
				source: "AI_ESCALATION",
				createdById: null,
				customerId: verifiedCustomerId,
				conversationId: context.conversationId,
			},
			select: { id: true },
		});
		if (agent.postEscalationCheckMinutes != null) {
			await schedulePostEscalationCheck({
				organizationId: agent.organizationId,
				agentId: context.agentId,
				conversationId: context.conversationId,
				customerId: verifiedCustomerId,
				taskId: task.id,
				minutes: agent.postEscalationCheckMinutes,
				window: {
					start: agent.followUpWindowStart,
					end: agent.followUpWindowEnd,
				},
			});
		}
	}
}

/** Any caller: a second Telegram this soon is the same alert twice. */
const RESEND_WINDOW_MS = 10 * 60_000;
/**
 * The bot's own calls: until the team closes the task it filed, a repeat call
 * about the same chat updates that task instead of alerting the team again.
 * One customer produced seven alerts in a day while the team was already
 * talking to him. `high` (outage, safety) always gets through.
 */
const BOT_REPEAT_WINDOW_MS = 6 * 60 * 60_000;

/**
 * The escalation task that makes a new Telegram redundant, or null when
 * this call should alert the team.
 */
async function findActiveEscalation(
	conversationId: string,
	source: EscalationSource,
	priority: string,
): Promise<{ id: string; status: string } | null> {
	const { db } = await import("@repo/database");
	const now = Date.now();
	const recent = await db.task.findFirst({
		where: {
			conversationId,
			source: "AI_ESCALATION",
			createdAt: { gte: new Date(now - BOT_REPEAT_WINDOW_MS) },
		},
		orderBy: { createdAt: "desc" },
		select: { id: true, status: true, createdAt: true },
	});
	if (!recent) {
		return null;
	}
	if (now - recent.createdAt.getTime() <= RESEND_WINDOW_MS) {
		return recent;
	}
	return source === "bot" && priority !== "high" && isTaskLive(recent.status)
		? recent
		: null;
}

/** The team has not closed it yet. */
function isTaskLive(status: string): boolean {
	return status !== "COMPLETED" && status !== "CANCELLED";
}

/**
 * The open escalation task a check-back asked about, when the customer
 * answered that check-back in the last 72 hours.
 */
async function findCheckBackLinkedTask(
	conversationId: string,
): Promise<{ id: string } | null> {
	const { db } = await import("@repo/database");
	const row = await db.botFollowUp.findFirst({
		where: {
			conversationId,
			type: "post_escalation",
			taskId: { not: null },
			replyAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
			task: { status: "OPEN" },
		},
		orderBy: { replyAt: "desc" },
		select: { taskId: true },
	});
	return row?.taskId ? { id: row.taskId } : null;
}

/**
 * One scheduled check-back per conversation: a newer escalation moves the
 * pending one (new task, new due time) instead of stacking a second.
 */
async function schedulePostEscalationCheck(input: {
	organizationId: string;
	agentId: string;
	conversationId: string;
	customerId: string | null;
	taskId: string;
	minutes: number;
	window: FollowUpWindow;
}): Promise<void> {
	const { db } = await import("@repo/database");
	const now = new Date();
	// Attempt 2: moved into the window, never dropped.
	const dueAt =
		resolveFollowUpFireAt(now, input.minutes, input.window, 2) ??
		new Date(now.getTime() + input.minutes * 60_000);
	const pending = await db.botFollowUp.findFirst({
		where: {
			conversationId: input.conversationId,
			type: "post_escalation",
			status: "scheduled",
		},
		select: { id: true },
	});
	if (pending) {
		await db.botFollowUp.update({
			where: { id: pending.id },
			data: { taskId: input.taskId, dueAt },
		});
		return;
	}
	await db.botFollowUp.create({
		data: {
			organizationId: input.organizationId,
			agentId: input.agentId,
			type: "post_escalation",
			channel: "bot",
			status: "scheduled",
			conversationId: input.conversationId,
			customerId: input.customerId,
			taskId: input.taskId,
			dueAt,
		},
	});
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

				const source = escalationSourceFromToolCallId(
					options?.toolCallId,
				);

				// ---- Telegram dedup: the team already has this one ----
				const activeEscalation = await findActiveEscalation(
					context.conversationId,
					source,
					args.priority,
				);

				if (activeEscalation) {
					// Keep the task current, but don't spam Telegram
					if (isTaskLive(activeEscalation.status)) {
						db.task
							.update({
								where: { id: activeEscalation.id },
								data: escalationTaskFields(args),
							})
							.catch((err) =>
								logger.error(
									"Failed to update escalation task",
									{
										error: err,
									},
								),
							);
					}

					return {
						success: true,
						message:
							"Escalation already active for this conversation — task updated with latest info. You can confirm to the customer that the team is already aware.",
					};
				}

				const now = new Date();

				// ---- Load conversation, customer, and recent messages ----
				let contactId: string | null = null;
				let contactName: string | null = null;
				let customer: CustomerDetails | null = null;
				let customerMatch: "verified" | "phone" | null = null;
				let verifiedCustomerId: string | null = null;
				let organizationSlug: string | null = null;
				let organizationName: string | null = null;
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
											select: { slug: true, name: true },
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
						organizationName = conversation.agent.organization.name;

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

				// ---- Build and send Telegram message ----
				const message = buildEscalationMessage({
					priority: args.priority,
					category: args.category,
					organizationName,
					reason: args.reason,
					source,
					displayName,
					customer,
					customerMatch,
					ispCustomer,
					customerUsername: args.customerUsername,
					contactPhone: contactId,
					// The caller's own words: a second model paraphrasing the
					// chat dropped the username, numbers and what was agreed.
					summary: args.summary,
					actionRequired: args.actionRequired,
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
						args,
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
						message: `Escalation sent to ${succeeded}/${chatIds.length} recipients (priority: ${args.priority}). You can now confirm to the customer that their request has been forwarded.`,
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
			{
				key: "summaryTelegramChatIds",
				label: "Conversation summary Chat IDs (optional)",
				type: "repeater",
				required: false,
				placeholder: "e.g. 123456789",
				description:
					"Where conversation summaries go (Agent settings → Conversation summaries). Leave empty to use the escalation chats above.",
			},
			{
				key: "teammateWaitAlert",
				label: "Alert when a customer waits on a teammate",
				type: "select",
				required: false,
				defaultValue: "off",
				options: [
					{ label: "Off", value: "off" },
					{
						label: "On — after 20 minutes without a reply",
						value: "on",
					},
				],
				description:
					"When a teammate is handling a chat and the customer's message goes unanswered. Either way the bot answers after 30 minutes.",
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

### One escalation per issue
Escalate an issue ONCE. If you already escalated it in this conversation, do not call the tool again for follow-up pressure, thanks, or a repeat of the same complaint — tell the customer the team is already aware. Call it again only for a genuinely NEW issue, or when the customer gives something the team cannot act without (a callback number, an address, a username).

IMPORTANT: Do NOT refuse to escalate because you lack account details. The team can look up and verify the customer themselves. Missing info is NEVER a reason to block escalation. Include whatever you have (name, phone number from the chat, the customer's own description) and let the team handle the rest.

Priority levels:
- **high**: outages, critical issues
- **medium**: sales, cancellations, unresolved tech issues
- **low**: general inquiries`,
};

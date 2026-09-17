import type { config } from "@repo/config";

// Email job types
export interface EmailJobData {
	to: string;
	locale?: keyof typeof config.i18n.locales;
	templateId?: string;
	context?: Record<string, unknown>;
	subject?: string;
	text?: string;
	html?: string;
}

// Webhook job types
export interface WebhookJobData {
	webhookId: string;
	deliveryId: string;
	url: string;
	secret: string;
	payload: string;
	event: string;
	organizationId: string;
}

// Scheduled job types
export type ScheduledJobType =
	| "account-deletion"
	| "quota-reset"
	| "ai-credit-reset"
	| "watcher-scheduler"
	| "watcher-cleanup"
	| "online-status-sync"
	| "network-monitor-sync"
	| "dealer-sync"
	| "recurring-expenses";

export interface ScheduledJobData {
	type: ScheduledJobType;
}

// Job result types
export interface EmailJobResult {
	success: boolean;
	messageId?: string;
}

export interface WebhookJobResult {
	success: boolean;
	statusCode?: number;
	response?: string;
}

export interface ScheduledJobResult {
	processedCount: number;
}

// AI chat job types
export interface AiChatJobData {
	conversationId: string;
	channelId: string;
	userMessageId?: string;
}

export interface AiChatJobResult {
	success: boolean;
	error?: string;
}

// AI follow-up (silence nudge) job types
export interface AiFollowUpJobData {
	conversationId: string;
	channelId: string;
	/** ISO timestamp of the bot reply this follow-up belongs to. */
	repliedAt: string;
}

export interface AiFollowUpJobResult {
	success: boolean;
	skipped?: string;
}

// Integration sync job types
export type IntegrationSyncOperationType =
	| "push_single"
	| "push_bulk"
	| "sync_all";

export type IntegrationSyncTrigger =
	| "manual"
	| "contact.created"
	| "contact.updated";

export interface IntegrationSyncJobData {
	operationId: string;
	connectionId: string;
	contactIds: string[] | null; // null means sync all
	trigger: IntegrationSyncTrigger;
	type: IntegrationSyncOperationType;
}

export interface IntegrationSyncJobResult {
	success: boolean;
	operationId: string;
	successCount: number;
	errorCount: number;
}

// Watcher check job types
export interface WatcherCheckJobData {
	watcherId: string;
	type: string; // "ping" | "http" | "port" | "dns"
	target: string;
	config: Record<string, unknown> | null;
}

export interface WatcherCheckJobResult {
	success: boolean;
	latencyMs?: number | undefined;
	message: string;
}

// iRadius sync job types
export interface IRadiusSyncJobData {
	operationId: string;
	organizationId?: string | undefined;
	mode?: "full" | "dealers-only" | undefined;
}

export interface IRadiusSyncJobResult {
	success: boolean;
	operationId: string;
}

// iRadius push (local → iRadius) job types
export interface IRadiusPushJobData {
	operationId: string;
	organizationId: string;
}

export interface IRadiusPushJobResult {
	success: boolean;
	operationId: string;
}

// Organization setup job types
export interface OrgSetupJobData {
	organizationId: string;
}

export interface OrgSetupJobResult {
	success: boolean;
}

// WhatsApp receipt job types
export interface WhatsAppReceiptJobData {
	phone: string;
	paymentId: string;
	source?: "auto" | "manual" | undefined;
}

export interface WhatsAppReceiptJobResult {
	success: boolean;
}

// WhatsApp template retry job types (official WPBox number)

/** Outcome of a dealer money confirmation, as shown to staff. */
export type DealerNoticeStatus =
	| "sent"
	/** First send hit a transient error; the whatsapp-template worker retries. */
	| "retrying"
	| "failed"
	| "no_phone"
	| "invalid_phone"
	/** WPBOX_TOKEN missing — the official number is not set up. */
	| "not_configured"
	/** Staff unticked "WhatsApp the dealer"; can still be sent later. */
	| "skipped";

/** Stored on `IspDealerAccount.whatsappNotice`. */
export interface DealerWhatsAppNotice {
	status: DealerNoticeStatus;
	/** Digits sent to, or the raw value that did not parse. */
	phone: string | null;
	/** `dealer_account_update` body params, reused verbatim on resend. */
	params: string[];
	error: string | null;
	messageId: string | null;
	updatedAt: string;
}

export interface WhatsAppTemplateJobData {
	kind: "dealer_account_update";
	dealerAccountId: string;
	phone: string;
	params: string[];
}

export interface WhatsAppTemplateJobResult {
	success: boolean;
}

// Marketing send job types (Salti broadcasts)
export interface MarketingSendJobData {
	broadcastId: string;
}

export interface MarketingSendJobResult {
	success: boolean;
	sentCount: number;
	failedCount: number;
}

// Telegram location notification job types
export interface TelegramLocationJobData {
	employeeId: string;
	customerId: string;
	organizationId: string;
}

export interface TelegramLocationJobResult {
	success: boolean;
}

// Generic Telegram employee notification job types
export interface TelegramNotifyJobData {
	organizationId: string;
	// Either resolve the chat id from an employee, or send to a raw chat id
	// (used for admin alerts to a configured org chat). Exactly one is set.
	employeeId?: string;
	chatId?: string;
	text: string;
	/**
	 * Telegram formatting mode for `text`. Defaults to "Markdown" at the worker.
	 * Rich notifications pass "HTML" (escaped bold headers, tap-to-copy values).
	 */
	parseMode?: "Markdown" | "HTML";
}

export interface TelegramNotifyJobResult {
	success: boolean;
}

// Location request (customer self-serve) job types
export interface LocationRequestJobData {
	organizationId: string;
	customerId: string;
	createdById: string;
}

export interface LocationRequestJobResult {
	success: boolean;
}

// Billing sync job types
export interface EmployeeMapping {
	action: "skip" | "create" | "map";
	targetEmployeeId?: string | undefined;
	createName?: string | undefined;
	role?: string | undefined;
	phone?: string | undefined;
	telegram?: string | undefined;
}

export interface BillingSyncJobData {
	operationId: string;
	organizationId: string;
	employeeMappings?: Record<string, EmployeeMapping> | undefined;
}

export interface BillingSyncJobResult {
	success: boolean;
	operationId: string;
}

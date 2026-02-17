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
	| "watcher-cleanup";

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

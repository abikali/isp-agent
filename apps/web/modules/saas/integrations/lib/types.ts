/**
 * Integration provider metadata for frontend display.
 */
export interface IntegrationProvider {
	/** Nango provider config key */
	key: string;
	/** Display name */
	name: string;
	/** Short description */
	description: string;
	/** Category for grouping */
	category: "crm" | "communication" | "automation" | "productivity";
	/** Whether this provider supports contact sync */
	supportsContactSync: boolean;
	/** Whether this provider is coming soon (not yet available) */
	comingSoon?: boolean;
}

/**
 * Integration connection from the API.
 */
export interface IntegrationConnection {
	id: string;
	providerConfigKey: string;
	providerName: string;
	name: string | null;
	syncMode: "manual" | "auto";
	autoSyncEvents: string[];
	status: "connected" | "disconnected" | "error";
	lastSyncAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: {
		id: string;
		name: string | null;
		image: string | null;
	};
	_count: {
		syncOperations: number;
	};
}

/**
 * Sync operation from the API.
 */
export interface SyncOperation {
	id: string;
	type: "push_single" | "push_bulk" | "sync_all";
	status: "pending" | "in_progress" | "completed" | "failed";
	trigger: string | null;
	totalContacts: number;
	successCount: number;
	errorCount: number;
	errors: unknown;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
}

/**
 * Contact sync operation type alias.
 */
export type ContactSyncOperation = SyncOperation;

import z from "zod";

/**
 * Sync mode options for integration connections.
 */
export const SyncModeSchema = z.enum(["manual", "auto"]);
export type SyncMode = z.infer<typeof SyncModeSchema>;

/**
 * Auto-sync event options.
 */
export const AutoSyncEventSchema = z.enum([
	"contact.created",
	"contact.updated",
]);
export type AutoSyncEvent = z.infer<typeof AutoSyncEventSchema>;

/**
 * Connection status options.
 */
export const ConnectionStatusSchema = z.enum([
	"connected",
	"disconnected",
	"error",
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

/**
 * Sync operation type options.
 */
export const SyncOperationTypeSchema = z.enum([
	"push_single",
	"push_bulk",
	"sync_all",
]);
export type SyncOperationType = z.infer<typeof SyncOperationTypeSchema>;

/**
 * Sync operation status options.
 */
export const SyncOperationStatusSchema = z.enum([
	"pending",
	"in_progress",
	"completed",
	"failed",
]);
export type SyncOperationStatus = z.infer<typeof SyncOperationStatusSchema>;

/**
 * Input schema for saving a new connection.
 */
export const SaveConnectionInputSchema = z.object({
	organizationId: z.string(),
	providerConfigKey: z.string(),
	connectionId: z.string(),
	providerName: z.string(),
	name: z.string().optional(),
});

/**
 * Input schema for updating connection settings.
 */
export const UpdateConnectionInputSchema = z.object({
	connectionId: z.string(),
	syncMode: SyncModeSchema.optional(),
	autoSyncEvents: z.array(AutoSyncEventSchema).optional(),
	name: z.string().optional(),
});

/**
 * Input schema for syncing contacts.
 */
export const SyncContactsInputSchema = z.object({
	connectionId: z.string(),
	contactIds: z.array(z.string()).optional(), // If not provided, sync all
});

/**
 * Sync trigger type for tracking what initiated the sync.
 */
export const SyncTriggerSchema = z.enum([
	"manual",
	"contact.created",
	"contact.updated",
]);
export type SyncTrigger = z.infer<typeof SyncTriggerSchema>;

// Dedicated export for integration sync functionality
// This allows the API module to import without circular dependencies

export { queueContactSync } from "./src/jobs/integration-sync.jobs";
export type {
	IntegrationSyncJobData,
	IntegrationSyncJobResult,
	IntegrationSyncOperationType,
	IntegrationSyncTrigger,
} from "./src/types";

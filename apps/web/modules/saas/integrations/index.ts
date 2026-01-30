/**
 * Server-safe exports for the integrations module.
 * Only export types, constants, and server-safe utilities here.
 */

// Constants
export {
	AUTO_SYNC_EVENTS,
	INTEGRATION_PROVIDERS,
	PROVIDER_CATEGORIES,
} from "./lib/providers";
// Types
export type {
	ContactSyncOperation,
	IntegrationConnection,
	IntegrationProvider,
} from "./lib/types";

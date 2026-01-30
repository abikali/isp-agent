"use client";

/**
 * Client-only exports for the integrations module.
 * These exports require React and client-side features.
 */

export {
	ConnectedIntegrations,
	ConnectedIntegrationsSkeleton,
} from "./components/ConnectedIntegrations";
export { ConnectionSettingsDialog } from "./components/ConnectionSettingsDialog";
export { IntegrationCard } from "./components/IntegrationCard";
// Components
export {
	IntegrationsGrid,
	IntegrationsGridSkeleton,
} from "./components/IntegrationsGrid";
export { SyncHistoryDialog } from "./components/SyncHistoryDialog";
// Hooks
export {
	connectionsQueryOptions,
	useConnectionsQuery,
	useConnectionsQueryNonSuspense,
	useDeleteConnectionMutation,
	useSyncContactsMutation,
	useSyncHistoryQuery,
	useUpdateConnectionMutation,
} from "./hooks/use-connections";
export { useNangoConnect } from "./hooks/use-nango-connect";
// Re-export server-safe items for convenience
export * from "./index";

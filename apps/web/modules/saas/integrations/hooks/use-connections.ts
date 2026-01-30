"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Query options for fetching integration connections.
 */
export function connectionsQueryOptions(organizationId: string) {
	return orpc.integrations.listConnections.queryOptions({
		input: { organizationId },
	});
}

/**
 * Hook to fetch integration connections (for Suspense boundary).
 * @param organizationId - The organization ID (must be passed from loader data to avoid hydration issues)
 */
export function useConnectionsQuery(organizationId: string) {
	return useSuspenseQuery(connectionsQueryOptions(organizationId));
}

/**
 * Hook to fetch connections without Suspense (for use in dialogs, etc).
 */
export function useConnectionsQueryNonSuspense() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? connectionsQueryOptions(organizationId)
			: disabledQuery(["integrations", "connections"]),
	);
}

/**
 * Hook for creating a Nango connect session.
 */
export function useCreateSessionMutation() {
	return useMutation(orpc.integrations.createSession.mutationOptions());
}

/**
 * Hook for saving a connection after OAuth.
 */
export function useSaveConnectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.integrations.saveConnection.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.integrations.listConnections.key(),
			});
			toast.success("Integration connected successfully!");
		},
		onError: () => {
			toast.error("Failed to save connection");
		},
	});
}

/**
 * Hook for updating connection settings.
 */
export function useUpdateConnectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.integrations.updateConnection.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.integrations.listConnections.key(),
			});
			toast.success("Settings saved");
		},
		onError: () => {
			toast.error("Failed to save settings");
		},
	});
}

/**
 * Hook for deleting (disconnecting) a connection.
 */
export function useDeleteConnectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.integrations.deleteConnection.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.integrations.listConnections.key(),
			});
			toast.success("Integration disconnected");
		},
		onError: () => {
			toast.error("Failed to disconnect integration");
		},
	});
}

/**
 * Hook for triggering a contact sync.
 */
export function useSyncContactsMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.integrations.syncContacts.mutationOptions(),
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: orpc.integrations.listConnections.key(),
			});
			toast.success(data.message);
		},
		onError: () => {
			toast.error("Failed to start sync");
		},
	});
}

/**
 * Query options for fetching sync history.
 */
export function syncHistoryQueryOptions(connectionId: string, limit = 10) {
	return orpc.integrations.listSyncHistory.queryOptions({
		input: { connectionId, limit },
	});
}

/**
 * Hook to fetch sync history.
 */
export function useSyncHistoryQuery(connectionId: string, limit = 10) {
	return useQuery(syncHistoryQueryOptions(connectionId, limit));
}

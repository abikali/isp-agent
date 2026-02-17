"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export function useWatchers() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.watchers.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return { watchers: query.data?.watchers ?? [] };
}

export function useWatchersQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.watchers.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["watchers", "list"]),
	);

	return {
		watchers: query.data?.watchers ?? [],
		isLoading: query.isLoading,
	};
}

export function useWatcher(watcherId: string) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.watchers.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				watcherId,
			},
		}),
	);

	return { watcher: query.data?.watcher };
}

export function useCreateWatcher() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.watchers.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.watchers.list.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.watchers.getStats.key(),
			});
		},
	});
}

export function useUpdateWatcher() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.watchers.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.watchers.key(),
			});
		},
	});
}

export function useDeleteWatcher() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.watchers.deleteWatcher.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.watchers.list.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.watchers.getStats.key(),
			});
		},
	});
}

export function useToggleWatcher() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.watchers.toggleEnabled.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.watchers.key(),
			});
		},
	});
}

export function useRunWatcherNow() {
	return useMutation({
		...orpc.watchers.runNow.mutationOptions(),
	});
}

export function useMessagingChannels() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.watchers.listMessagingChannels.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["watchers", "listMessagingChannels"]),
	);

	return {
		channels: query.data?.channels ?? [],
		isLoading: query.isLoading,
	};
}

"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useChannels(agentId: string, organizationId: string) {
	const query = useQuery(
		orpc.aiAgents.listChannels.queryOptions({
			input: { agentId, organizationId },
		}),
	);

	return {
		channels: query.data?.channels ?? [],
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}

export function useCreateChannel() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.createChannel.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.key(),
			});
		},
	});
}

export function useDeleteChannel() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.deleteChannel.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.key(),
			});
		},
	});
}

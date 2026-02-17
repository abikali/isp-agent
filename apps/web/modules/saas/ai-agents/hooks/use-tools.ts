"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAvailableTools() {
	const query = useQuery(orpc.aiAgents.listTools.queryOptions({}));

	return {
		tools: query.data?.tools ?? [],
		isLoading: query.isLoading,
	};
}

export function useUpdateToolConfig() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.updateToolConfig.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.key(),
			});
		},
	});
}

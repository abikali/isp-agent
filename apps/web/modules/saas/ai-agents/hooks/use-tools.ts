"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAvailableTools() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.aiAgents.listTools.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["aiAgents", "listTools"]),
	);

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

export function useTestTelegramConfig() {
	return useMutation(orpc.aiAgents.testTelegramConfig.mutationOptions());
}

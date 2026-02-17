"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export function useAgents() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.aiAgents.listAgents.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return { agents: query.data?.agents ?? [] };
}

export function useAgentsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.aiAgents.listAgents.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["aiAgents", "listAgents"]),
	);

	return {
		agents: query.data?.agents ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreateAgent() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.createAgent.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listAgents.key(),
			});
		},
	});
}

export function useUpdateAgent() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.updateAgent.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.key(),
			});
		},
	});
}

export function useDeleteAgent() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.deleteAgent.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listAgents.key(),
			});
		},
	});
}

export function useGenerateSystemPrompt() {
	return useMutation(orpc.aiAgents.generateSystemPrompt.mutationOptions());
}

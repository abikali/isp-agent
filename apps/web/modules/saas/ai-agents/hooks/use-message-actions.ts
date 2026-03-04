"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useReactToMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.reactToMessage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.getConversationMessages.key(),
			});
		},
	});
}

export function useDeleteMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.deleteMessage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.getConversationMessages.key(),
			});
		},
	});
}

export function useEditMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.editMessage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.getConversationMessages.key(),
			});
		},
	});
}

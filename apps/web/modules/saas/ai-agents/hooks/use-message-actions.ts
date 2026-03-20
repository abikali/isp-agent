"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useReactToMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.reactToMessage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.getConversationMessages.key(),
			});
		},
		onError: () => {
			toast.error("Failed to react");
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
		onError: () => {
			toast.error("Failed to delete message");
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
		onError: () => {
			toast.error("Failed to edit message");
		},
	});
}

"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useToggleWebChat() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.toggleWebChat.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.key(),
			});
		},
	});
}

"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Follow-up state + actions for one conversation (context panel). */
export function useConversationFollowUp(
	conversationId: string,
	organizationId: string,
) {
	return useQuery({
		...orpc.aiAgents.getConversationFollowUp.queryOptions({
			input: { conversationId, organizationId },
		}),
		refetchInterval: 15_000,
	});
}

/** A follow-up action changes the panel, the list badge and the thread. */
function useInvalidateFollowUp() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({
			queryKey: orpc.aiAgents.getConversationFollowUp.key(),
		});
		queryClient.invalidateQueries({
			queryKey: orpc.aiAgents.listAllConversations.key(),
		});
		queryClient.invalidateQueries({
			queryKey: orpc.aiAgents.getConversationMessages.key(),
		});
	};
}

export function usePreviewFollowUp() {
	return useMutation(orpc.aiAgents.previewFollowUp.mutationOptions());
}

export function useSendFollowUpNow() {
	const onSuccess = useInvalidateFollowUp();
	return useMutation({
		...orpc.aiAgents.sendFollowUpNow.mutationOptions(),
		onSuccess,
	});
}

export function useCancelFollowUp() {
	const onSuccess = useInvalidateFollowUp();
	return useMutation({
		...orpc.aiAgents.cancelConversationFollowUp.mutationOptions(),
		onSuccess,
	});
}

export function useSetFollowUpMuted() {
	const onSuccess = useInvalidateFollowUp();
	return useMutation({
		...orpc.aiAgents.setFollowUpMuted.mutationOptions(),
		onSuccess,
	});
}

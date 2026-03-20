"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface AllConversationsFilters {
	agentId?: string | undefined;
	search?: string | undefined;
	channelType?: "web" | "whatsapp" | "telegram" | undefined;
	status?: "active" | "archived" | undefined;
	pinned?: boolean | undefined;
	sortBy?: "lastMessageAt" | "messageCount" | "createdAt" | undefined;
	sortOrder?: "asc" | "desc" | undefined;
}

export function useAllConversations(
	organizationId: string,
	filters?: AllConversationsFilters,
) {
	const query = useQuery({
		...orpc.aiAgents.listAllConversations.queryOptions({
			input: {
				organizationId,
				agentId: filters?.agentId,
				search: filters?.search,
				channelType: filters?.channelType,
				status: filters?.status,
				pinned: filters?.pinned,
				sortBy: filters?.sortBy,
				sortOrder: filters?.sortOrder,
			},
		}),
		refetchInterval: 10000,
	});

	return {
		conversations: query.data?.conversations ?? [],
		nextCursor: query.data?.nextCursor,
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}

export function useSendAdminMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.sendAdminMessage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.getConversationMessages.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listAllConversations.key(),
			});
		},
	});
}

export function useTogglePinConversation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.togglePinConversation.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listAllConversations.key(),
			});
		},
	});
}

export function useSearchMessages(
	conversationId: string,
	organizationId: string,
	query: string,
) {
	const result = useQuery({
		...orpc.aiAgents.searchConversationMessages.queryOptions({
			input: { conversationId, organizationId, query },
		}),
		enabled: query.length > 0,
	});

	return {
		messages: result.data?.messages ?? [],
		isLoading: result.isLoading,
	};
}

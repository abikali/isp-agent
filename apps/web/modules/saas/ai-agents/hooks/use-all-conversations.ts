"use client";

import { orpc } from "@shared/lib/orpc";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

interface AllConversationsFilters {
	agentId?: string | undefined;
	search?: string | undefined;
	channelType?: "web" | "whatsapp" | "telegram" | undefined;
	status?: "active" | "archived" | undefined;
	pinned?: boolean | undefined;
	sortBy?: "lastMessageAt" | "messageCount" | "createdAt" | undefined;
	sortOrder?: "asc" | "desc" | undefined;
}

const PAGE_SIZE = 20;

export function useAllConversations(
	organizationId: string,
	filters?: AllConversationsFilters,
) {
	const query = useInfiniteQuery({
		...orpc.aiAgents.listAllConversations.infiniteOptions({
			input: (cursor: string | undefined) => ({
				organizationId,
				agentId: filters?.agentId,
				search: filters?.search,
				channelType: filters?.channelType,
				status: filters?.status,
				pinned: filters?.pinned,
				sortBy: filters?.sortBy,
				sortOrder: filters?.sortOrder,
				limit: PAGE_SIZE,
				cursor,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor,
		}),
		refetchInterval: 10000,
	});

	const conversations = useMemo(
		() => query.data?.pages.flatMap((page) => page.conversations) ?? [],
		[query.data],
	);

	return {
		conversations,
		isLoading: query.isLoading,
		isFetchingNextPage: query.isFetchingNextPage,
		hasNextPage: query.hasNextPage,
		fetchNextPage: query.fetchNextPage,
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
		onError: () => {
			toast.error("Failed to send message");
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
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listConversations.key(),
			});
		},
		onError: () => {
			toast.error("Failed to update pin");
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

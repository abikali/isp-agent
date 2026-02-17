"use client";

import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

export function useConversations(
	agentId: string,
	organizationId: string,
	options?: { channelId?: string; status?: "active" | "archived" },
) {
	const query = useQuery({
		...orpc.aiAgents.listConversations.queryOptions({
			input: {
				agentId,
				organizationId,
				channelId: options?.channelId,
				status: options?.status,
			},
		}),
		refetchInterval: 10000, // Poll every 10s
	});

	return {
		conversations: query.data?.conversations ?? [],
		nextCursor: query.data?.nextCursor,
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}

export function useConversationMessages(
	conversationId: string,
	organizationId: string,
) {
	const query = useQuery({
		...orpc.aiAgents.getConversationMessages.queryOptions({
			input: { conversationId, organizationId },
		}),
		refetchInterval: 3000, // Poll every 3s for real-time feel
	});

	return {
		conversation: query.data?.conversation,
		messages: query.data?.messages ?? [],
		nextCursor: query.data?.nextCursor,
		isLoading: query.isLoading,
	};
}

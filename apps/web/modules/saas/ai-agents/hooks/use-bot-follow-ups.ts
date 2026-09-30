"use client";

import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export type BotFollowUpTab = "approval" | "scheduled" | "waiting" | "done";

export interface BotFollowUpFilters {
	organizationId: string;
	tab?: BotFollowUpTab | undefined;
	customerId?: string | undefined;
	conversationId?: string | undefined;
	search?: string | undefined;
}

/** The Bot follow-ups page list (inside an AsyncBoundary). */
export function useBotFollowUps(filters: BotFollowUpFilters) {
	const query = useSuspenseQuery(
		orpc.aiAgents.botFollowUps.list.queryOptions({
			input: { ...filters, limit: 100 },
		}),
	);
	return { items: query.data.items, refetch: query.refetch };
}

/** Follow-ups of one customer (customer Bot tab). */
export function useCustomerBotFollowUps(
	organizationId: string,
	customerId: string,
) {
	return useQuery(
		orpc.aiAgents.botFollowUps.list.queryOptions({
			input: { organizationId, customerId, limit: 50 },
		}),
	);
}

export function useBotFollowUpStats(organizationId: string) {
	return useQuery(
		orpc.aiAgents.botFollowUps.stats.queryOptions({
			input: { organizationId },
		}),
	);
}

function useInvalidateBotFollowUps() {
	const queryClient = useQueryClient();
	return () =>
		queryClient.invalidateQueries({
			queryKey: orpc.aiAgents.botFollowUps.key(),
		});
}

export function useApproveBotFollowUps() {
	const onSuccess = useInvalidateBotFollowUps();
	return useMutation({
		...orpc.aiAgents.botFollowUps.approve.mutationOptions(),
		onSuccess,
	});
}

export function useSkipBotFollowUps() {
	const onSuccess = useInvalidateBotFollowUps();
	return useMutation({
		...orpc.aiAgents.botFollowUps.skip.mutationOptions(),
		onSuccess,
	});
}

export function useSendBotFollowUpNow() {
	const onSuccess = useInvalidateBotFollowUps();
	return useMutation({
		...orpc.aiAgents.botFollowUps.sendNow.mutationOptions(),
		onSuccess,
	});
}

/** Episode summaries of a conversation or of a customer's conversations. */
export function useConversationSummaries(input: {
	organizationId: string;
	conversationId?: string | undefined;
	customerId?: string | undefined;
}) {
	return useQuery(
		orpc.aiAgents.conversationSummaries.list.queryOptions({ input }),
	);
}

/** Bot conversations linked to a customer. */
export function useCustomerConversations(
	organizationId: string,
	customerId: string,
) {
	return useQuery(
		orpc.aiAgents.listAllConversations.queryOptions({
			input: { organizationId, customerId, limit: 20 },
		}),
	);
}

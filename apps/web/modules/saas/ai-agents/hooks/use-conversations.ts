"use client";

import { orpc } from "@shared/lib/orpc";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type RefObject,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";

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

const MESSAGES_PAGE_SIZE = 50;

export function useConversationMessages(
	conversationId: string,
	organizationId: string,
) {
	const query = useInfiniteQuery({
		...orpc.aiAgents.getConversationMessages.infiniteOptions({
			input: (cursor: string | undefined) => ({
				conversationId,
				organizationId,
				limit: MESSAGES_PAGE_SIZE,
				cursor,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor,
		}),
		refetchInterval: (query) => {
			// Stop polling if conversation was deleted (e.g. via /clear command)
			if (query.state.error) {
				return false;
			}
			return 3000;
		},
	});

	// Pages come newest-first from the API; flatten and reverse so
	// components render oldest -> newest.
	const messages = useMemo(
		() =>
			(
				query.data?.pages.flatMap((page) => page.messages) ?? []
			).reverse(),
		[query.data],
	);

	return {
		conversation: query.data?.pages[0]?.conversation,
		messages,
		isLoading: query.isLoading,
		hasOlderMessages: query.hasNextPage,
		isFetchingOlderMessages: query.isFetchingNextPage,
		fetchOlderMessages: query.fetchNextPage,
	};
}

/**
 * Lazy-loads older messages when the user scrolls near the top of the
 * thread, preserving the visual scroll position when the older page is
 * prepended. Returns the onScroll handler for the scroll container.
 */
export function useLoadOlderMessagesOnScroll({
	scrollRef,
	firstMessageId,
	hasOlderMessages,
	isFetchingOlderMessages,
	fetchOlderMessages,
}: {
	scrollRef: RefObject<HTMLDivElement | null>;
	firstMessageId: string | undefined;
	hasOlderMessages: boolean;
	isFetchingOlderMessages: boolean;
	fetchOlderMessages: () => void;
}) {
	const prevScrollHeightRef = useRef<number | null>(null);

	const handleScroll = useCallback(() => {
		const el = scrollRef.current;
		if (
			el &&
			el.scrollTop < 100 &&
			hasOlderMessages &&
			!isFetchingOlderMessages &&
			prevScrollHeightRef.current === null
		) {
			prevScrollHeightRef.current = el.scrollHeight;
			fetchOlderMessages();
		}
	}, [
		scrollRef,
		hasOlderMessages,
		isFetchingOlderMessages,
		fetchOlderMessages,
	]);

	// After the older page renders, restore the user's position so the
	// content doesn't jump (anchor to the previously visible message).
	// biome-ignore lint/correctness/useExhaustiveDependencies: firstMessageId is the prepend signal
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (el && prevScrollHeightRef.current !== null) {
			el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
			prevScrollHeightRef.current = null;
		}
	}, [firstMessageId, scrollRef]);

	return handleScroll;
}

export function useResumeConversation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.aiAgents.resumeConversation.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.getConversationMessages.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listConversations.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.aiAgents.listAllConversations.key(),
			});
		},
	});
}

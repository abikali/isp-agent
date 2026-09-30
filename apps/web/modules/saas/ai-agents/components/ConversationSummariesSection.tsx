"use client";

import { Skeleton } from "@ui/components/skeleton";
import { useConversationSummaries } from "../hooks/use-bot-follow-ups";
import { ConversationSummaryCard } from "./ConversationSummaryCard";

/** "Summaries" block of the conversation context panel. */
export function ConversationSummariesSection({
	conversationId,
	organizationId,
}: {
	conversationId: string;
	organizationId: string;
}) {
	const { data, isLoading } = useConversationSummaries({
		organizationId,
		conversationId,
	});
	const summaries = data?.summaries ?? [];
	if (!isLoading && summaries.length === 0) {
		return null;
	}
	return (
		<section className="space-y-2 px-4 py-3">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				Summaries
			</div>
			{isLoading ? (
				<Skeleton className="h-16 w-full" />
			) : (
				<div className="space-y-2">
					{summaries.slice(0, 5).map((s) => (
						<ConversationSummaryCard key={s.id} summary={s} />
					))}
				</div>
			)}
		</section>
	);
}

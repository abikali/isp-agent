"use client";

import { BotFollowUpRow } from "@saas/ai-agents/components/BotFollowUpRow";
import { ConversationSummaryCard } from "@saas/ai-agents/components/ConversationSummaryCard";
import {
	useConversationSummaries,
	useCustomerBotFollowUps,
	useCustomerConversations,
} from "@saas/ai-agents/hooks/use-bot-follow-ups";
import { formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";

/**
 * Everything the bot did with this customer: its conversations, what each
 * one concluded, and the follow-ups it sent with their answers.
 */
export function CustomerBotTab({
	customerId,
	organizationSlug,
}: {
	customerId: string;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId() ?? "";
	const conversations = useCustomerConversations(organizationId, customerId);
	const summaries = useConversationSummaries({ organizationId, customerId });
	const followUps = useCustomerBotFollowUps(organizationId, customerId);

	const conversationRows = conversations.data?.conversations ?? [];
	const summaryRows = summaries.data?.summaries ?? [];
	const followUpRows = followUps.data?.items ?? [];

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Bot conversations</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{conversations.isLoading ? (
						<Skeleton className="h-12 w-full" />
					) : conversationRows.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No conversation is linked to this customer.
						</p>
					) : (
						conversationRows.map((c) => (
							<Link
								key={c.id}
								to="/app/$organizationSlug/conversations/$conversationId"
								params={{
									organizationSlug,
									conversationId: c.id,
								}}
								className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
							>
								<span className="min-w-0 truncate">
									{c.contactName ?? c.contactId ?? "Chat"}
									{c.lastMessage && (
										<span className="ml-2 text-xs text-muted-foreground">
											{c.lastMessage.content.slice(0, 80)}
										</span>
									)}
								</span>
								<span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
									<Badge variant="outline">
										{c.channel?.provider ?? "web"}
									</Badge>
									{c.lastMessageAt
										? formatDateTime(c.lastMessageAt, {
												day: "numeric",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											})
										: ""}
								</span>
							</Link>
						))
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm">
						What the bot concluded
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{summaries.isLoading ? (
						<Skeleton className="h-16 w-full" />
					) : summaryRows.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No conversation summaries yet.
						</p>
					) : (
						summaryRows.map((s) => (
							<ConversationSummaryCard key={s.id} summary={s} />
						))
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Bot follow-ups</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{followUps.isLoading ? (
						<Skeleton className="m-4 h-12" />
					) : followUpRows.length === 0 ? (
						<p className="px-6 pb-4 text-sm text-muted-foreground">
							No follow-ups sent to this customer.
						</p>
					) : (
						followUpRows.map((item) => (
							<BotFollowUpRow
								key={item.id}
								item={item}
								organizationSlug={organizationSlug}
								showCustomer={false}
							/>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

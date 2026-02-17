"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { MessageSquareIcon } from "lucide-react";
import { useConversations } from "../hooks/use-conversations";

export function ConversationsList({
	agentId,
	organizationId,
	organizationSlug,
}: {
	agentId: string;
	organizationId: string;
	organizationSlug: string;
}) {
	const { conversations, isLoading } = useConversations(
		agentId,
		organizationId,
	);

	if (conversations.length === 0 && !isLoading) {
		return (
			<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
				<MessageSquareIcon className="mb-3 size-8 text-muted-foreground/50" />
				<p className="text-sm text-muted-foreground">
					No conversations yet. Messages will appear here when users
					interact with this agent.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{conversations.map((conv) => (
				<Link
					key={conv.id}
					to="/app/$organizationSlug/ai-agents/$agentId/conversations/$conversationId"
					params={{
						organizationSlug,
						agentId,
						conversationId: conv.id,
					}}
					className="block"
					preload="intent"
				>
					<div className="flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="font-medium">
									{conv.contactName || "Unknown Contact"}
								</span>
								<Badge variant="outline" className="text-xs">
									{conv.channel
										? conv.channel.provider === "whatsapp"
											? "WhatsApp"
											: "Telegram"
										: "Web Chat"}
								</Badge>
							</div>
							{conv.lastMessage && (
								<p className="mt-1 truncate text-sm text-muted-foreground">
									<span className="font-medium">
										{conv.lastMessage.role === "assistant"
											? "Bot: "
											: "User: "}
									</span>
									{conv.lastMessage.content}
								</p>
							)}
						</div>
						<div className="shrink-0 text-right">
							<p className="text-xs text-muted-foreground">
								{conv.messageCount} msg
								{conv.messageCount !== 1 ? "s" : ""}
							</p>
							{conv.lastMessageAt && (
								<p className="text-xs text-muted-foreground">
									{new Date(
										conv.lastMessageAt,
									).toLocaleDateString()}
								</p>
							)}
						</div>
					</div>
				</Link>
			))}
		</div>
	);
}

"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { ArrowLeftIcon, LoaderIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useConversationMessages } from "../hooks/use-conversations";
import { ChatMarkdown } from "./ChatMarkdown";

export function ConversationThread({
	conversationId,
	organizationId,
	organizationSlug,
	agentId,
}: {
	conversationId: string;
	organizationId: string;
	organizationSlug: string;
	agentId: string;
}) {
	const { conversation, messages } = useConversationMessages(
		conversationId,
		organizationId,
	);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	const lastMessage = messages[messages.length - 1];
	const isAwaitingResponse =
		lastMessage?.role === "user" && !lastMessage.error;

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-3 border-b p-4">
				<Link
					to="/app/$organizationSlug/ai-agents/$agentId"
					params={{ organizationSlug, agentId }}
				>
					<Button variant="ghost" size="sm">
						<ArrowLeftIcon className="size-4" />
					</Button>
				</Link>
				<div>
					<h3 className="font-medium">
						{conversation?.contactName || "Unknown Contact"}
					</h3>
					{conversation?.channel && (
						<Badge variant="outline" className="text-xs">
							{conversation.channel.provider === "whatsapp"
								? "WhatsApp"
								: "Telegram"}
							{" · "}
							{conversation.channel.name}
						</Badge>
					)}
				</div>
			</div>

			{/* Messages */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
				<div className="space-y-3">
					{messages.map((msg) => (
						<div
							key={msg.id}
							className={cn(
								"flex",
								msg.role === "user"
									? "justify-start"
									: "justify-end",
							)}
						>
							<div
								className={cn(
									"max-w-[75%] rounded-lg px-4 py-2",
									msg.role === "user"
										? "bg-muted text-foreground"
										: "bg-primary text-primary-foreground",
									msg.error && "border border-destructive",
								)}
							>
								{msg.role === "user" ? (
									<p className="whitespace-pre-wrap text-sm">
										{msg.content}
									</p>
								) : (
									<ChatMarkdown content={msg.content} />
								)}
								<div
									className={cn(
										"mt-1 flex items-center gap-2 text-xs opacity-60",
									)}
								>
									<span>
										{new Date(
											msg.createdAt,
										).toLocaleTimeString()}
									</span>
									{msg.latencyMs && (
										<span>{msg.latencyMs}ms</span>
									)}
									{msg.error && (
										<span className="text-destructive">
											Error
										</span>
									)}
								</div>
							</div>
						</div>
					))}

					{isAwaitingResponse && (
						<div className="flex justify-end">
							<div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm text-muted-foreground">
								<LoaderIcon className="size-3 animate-spin" />
								Thinking...
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

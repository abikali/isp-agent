"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { cn } from "@ui/lib";
import {
	ArrowLeftIcon,
	LoaderIcon,
	MessageSquareIcon,
	PinIcon,
	PinOffIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	useSearchMessages,
	useTogglePinConversation,
} from "../hooks/use-all-conversations";
import { useConversationMessages } from "../hooks/use-conversations";
import { AdminChatInput } from "./AdminChatInput";

export function ConversationDetailPanel({
	conversationId,
	organizationId,
	organizationSlug,
	fullPage,
	pinned,
}: {
	conversationId: string;
	organizationId: string;
	organizationSlug: string;
	fullPage?: boolean | undefined;
	pinned?: boolean | undefined;
}) {
	const { conversation, messages } = useConversationMessages(
		conversationId,
		organizationId,
	);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [showSearch, setShowSearch] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const togglePin = useTogglePinConversation();
	const { messages: searchResults } = useSearchMessages(
		conversationId,
		organizationId,
		searchQuery,
	);

	const searchMatchIds = new Set(searchResults.map((m) => m.id));

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

	function handleTogglePin() {
		togglePin.mutate({
			conversationId,
			organizationId,
			pinned: !(pinned ?? false),
		});
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-3 border-b px-4 py-3">
				{fullPage && (
					<Link
						to="/app/$organizationSlug/conversations"
						params={{ organizationSlug }}
					>
						<Button variant="ghost" size="sm">
							<ArrowLeftIcon className="size-4" />
						</Button>
					</Link>
				)}
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-medium">
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
					{!conversation?.channel && (
						<Badge variant="outline" className="text-xs">
							Web Chat
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setShowSearch(!showSearch);
							if (showSearch) {
								setSearchQuery("");
							}
						}}
					>
						{showSearch ? (
							<XIcon className="size-4" />
						) : (
							<SearchIcon className="size-4" />
						)}
					</Button>
					{pinned !== undefined && (
						<Button
							variant="ghost"
							size="sm"
							onClick={handleTogglePin}
							disabled={togglePin.isPending}
						>
							{pinned ? (
								<PinOffIcon className="size-4" />
							) : (
								<PinIcon className="size-4" />
							)}
						</Button>
					)}
				</div>
			</div>

			{/* Search bar */}
			{showSearch && (
				<div className="border-b px-4 py-2">
					<Input
						placeholder="Search messages..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8 text-sm"
						autoFocus
					/>
					{searchQuery && (
						<p className="mt-1 text-xs text-muted-foreground">
							{searchResults.length} match
							{searchResults.length !== 1 ? "es" : ""}
						</p>
					)}
				</div>
			)}

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
									msg.role === "user" &&
										"bg-muted text-foreground",
									msg.role === "assistant" &&
										"bg-primary text-primary-foreground",
									msg.role === "admin" &&
										"bg-amber-500/15 text-foreground",
									msg.error && "border border-destructive",
									searchMatchIds.has(msg.id) &&
										"ring-2 ring-primary",
								)}
							>
								{msg.role === "admin" && (
									<span className="mb-1 block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
										Admin
									</span>
								)}
								<p className="whitespace-pre-wrap text-sm">
									{msg.content}
								</p>
								<div className="mt-1 flex items-center gap-2 text-xs opacity-60">
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

			{/* Admin chat input */}
			<AdminChatInput
				conversationId={conversationId}
				organizationId={organizationId}
			/>
		</div>
	);
}

export function ConversationDetailEmpty() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="text-center">
				<MessageSquareIcon className="mx-auto mb-3 size-10 text-muted-foreground/30" />
				<p className="text-sm text-muted-foreground">
					Select a conversation to view messages
				</p>
			</div>
		</div>
	);
}

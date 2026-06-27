"use client";

import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { cn } from "@ui/lib";
import type { UIMessage } from "ai";
import {
	ArrowLeftIcon,
	HandIcon,
	LoaderIcon,
	LockIcon,
	MoreVerticalIcon,
	PinIcon,
	PinOffIcon,
	PlayIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	useSearchMessages,
	useTogglePinConversation,
} from "../hooks/use-all-conversations";
import {
	useConversationMessages,
	useLoadOlderMessagesOnScroll,
	useResumeConversation,
} from "../hooks/use-conversations";
import {
	useDeleteMessage,
	useEditMessage,
	useReactToMessage,
} from "../hooks/use-message-actions";
import {
	getAvatarColor,
	getContactInitials,
	groupMessagesByDate,
} from "../lib/chat-utils";
import { AdminChatInput } from "./AdminChatInput";
import { ContactPhone } from "./ContactPhone";
import { ContactUsername } from "./ContactUsername";
import { DateSeparator, MessageBubble, TypingBubble } from "./MessageBubble";

interface ReplyTarget {
	id: string;
	role: string;
	content: string;
}

/** Format the human-takeover countdown label from a deadline and the current clock. */
function formatTakeoverRemaining(expiresAtMs: number, now: number): string {
	if (!expiresAtMs) {
		return "";
	}
	const remaining = expiresAtMs - now;
	if (remaining <= 0) {
		return "";
	}
	const mins = Math.floor(remaining / 60000);
	const secs = Math.floor((remaining % 60000) / 1000);
	if (mins >= 60) {
		const hrs = Math.floor(mins / 60);
		const m = mins % 60;
		return `${hrs}h ${m}m remaining`;
	}
	return `${mins}m ${secs}s remaining`;
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive conversation thread view; splitting further would scatter tightly-coupled message/scroll/takeover state
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
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- these are independent UI slices (search, reply target, edit target, clock); a reducer would not group them meaningfully
}) {
	const {
		conversation,
		messages,
		hasOlderMessages,
		isFetchingOlderMessages,
		fetchOlderMessages,
	} = useConversationMessages(conversationId, organizationId);
	const scrollRef = useRef<HTMLDivElement>(null);
	const handleScroll = useLoadOlderMessagesOnScroll({
		scrollRef,
		firstMessageId: messages[0]?.id,
		hasOlderMessages,
		isFetchingOlderMessages,
		fetchOlderMessages,
	});
	const [showSearch, setShowSearch] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
	const [editingMessage, setEditingMessage] = useState<{
		id: string;
		content: string;
	} | null>(null);
	const togglePin = useTogglePinConversation();
	const resumeConversation = useResumeConversation();
	const reactMutation = useReactToMessage();
	const deleteMutation = useDeleteMessage();
	const editMutation = useEditMessage();
	const [debouncedSearchQuery] = useDebouncedValue(searchQuery, {
		wait: 300,
	});
	const { messages: searchResults } = useSearchMessages(
		conversationId,
		organizationId,
		debouncedSearchQuery,
	);

	const searchMatchIds = new Set(searchResults.map((m) => m.id));

	// Auto-scroll to bottom only when new messages actually arrive
	const lastMessageId = messages[messages.length - 1]?.id;
	const prevLastMessageIdRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (lastMessageId !== prevLastMessageIdRef.current) {
			prevLastMessageIdRef.current = lastMessageId;
			if (scrollRef.current) {
				scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
			}
		}
	}, [lastMessageId]);

	const lastMessage = messages[messages.length - 1];
	const takeoverExpiresAt = conversation?.humanTakeoverExpiresAt
		? new Date(conversation.humanTakeoverExpiresAt)
		: null;
	const [now, setNow] = useState(() => Date.now());
	const isHumanTakeover = !!takeoverExpiresAt;
	const isAwaitingResponse =
		lastMessage?.role === "user" && !lastMessage.error && !isHumanTakeover;

	// Countdown timer for human takeover — tick a clock, derive the label in render
	const expiresAtMs = takeoverExpiresAt?.getTime() ?? 0;
	useEffect(() => {
		if (!expiresAtMs) {
			return;
		}
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [expiresAtMs]);
	const takeoverRemaining = formatTakeoverRemaining(expiresAtMs, now);

	function handleResumeAi() {
		resumeConversation.mutate({ conversationId, organizationId });
	}

	function handleTogglePin() {
		togglePin.mutate({
			conversationId,
			organizationId,
			pinned: !(pinned ?? false),
		});
	}

	const handleReact = useCallback(
		(messageId: string, emoji: string) => {
			reactMutation.mutate({ messageId, organizationId, emoji });
		},
		[reactMutation, organizationId],
	);

	const handleDelete = useCallback(
		(messageId: string) => {
			deleteMutation.mutate({ messageId, organizationId });
		},
		[deleteMutation, organizationId],
	);

	const handleEditSave = useCallback(
		(messageId: string, content: string) => {
			editMutation.mutate(
				{ messageId, organizationId, content },
				{
					onSuccess: () => setEditingMessage(null),
				},
			);
		},
		[editMutation, organizationId],
	);

	const channelLabel = conversation?.channel
		? conversation.channel.provider === "whatsapp"
			? "WhatsApp"
			: "Telegram"
		: "Web Chat";

	const agentName = conversation?.channel?.name ?? "";
	const subtitle = agentName
		? `via ${channelLabel} · ${agentName}`
		: channelLabel;

	const contactName = conversation?.contactName || "Unknown Contact";
	const initials = getContactInitials(contactName);
	const avatarColor = getAvatarColor(contactName);

	const messageGroups = groupMessagesByDate(messages);

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-3 border-b px-4 py-2.5">
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
				{/* Avatar */}
				<div
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
						avatarColor,
					)}
				>
					{initials}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<h3 className="truncate text-sm font-medium">
							{contactName}
						</h3>
						<ContactPhone
							contactId={conversation?.contactId}
							className="shrink-0"
						/>
						<ContactUsername
							username={conversation?.customers[0]?.username}
							className="shrink-0"
						/>
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{subtitle}
					</p>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-8">
							<MoreVerticalIcon className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() => {
								setShowSearch(!showSearch);
								if (showSearch) {
									setSearchQuery("");
								}
							}}
						>
							{showSearch ? (
								<XIcon className="mr-2 size-4" />
							) : (
								<SearchIcon className="mr-2 size-4" />
							)}
							{showSearch ? "Close search" : "Search messages"}
						</DropdownMenuItem>
						{pinned !== undefined && (
							<DropdownMenuItem
								onClick={handleTogglePin}
								disabled={togglePin.isPending}
							>
								{pinned ? (
									<PinOffIcon className="mr-2 size-4" />
								) : (
									<PinIcon className="mr-2 size-4" />
								)}
								{pinned ? "Unpin" : "Pin conversation"}
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
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

			{/* Human takeover banner */}
			{isHumanTakeover && (
				<div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 dark:bg-amber-950/30">
					<HandIcon className="size-4 text-amber-600 dark:text-amber-400" />
					<span className="flex-1 text-xs text-amber-800 dark:text-amber-300">
						AI paused — human takeover active
						{takeoverRemaining && (
							<span className="ml-1 font-medium">
								({takeoverRemaining})
							</span>
						)}
					</span>
					<Button
						variant="outline"
						size="sm"
						className="h-6 text-xs"
						onClick={handleResumeAi}
						disabled={resumeConversation.isPending}
					>
						<PlayIcon className="mr-1 size-3" />
						Resume AI
					</Button>
				</div>
			)}

			{/* Messages area with subtle wallpaper pattern */}
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="min-h-0 flex-1 overflow-y-auto bg-[repeating-linear-gradient(45deg,transparent,transparent_20px,color-mix(in_srgb,var(--muted)_15%,transparent)_20px,color-mix(in_srgb,var(--muted)_15%,transparent)_21px)] p-4"
			>
				<div className="space-y-2">
					{isFetchingOlderMessages && (
						<div className="flex justify-center py-2">
							<LoaderIcon className="size-4 animate-spin text-muted-foreground" />
						</div>
					)}
					{messageGroups.map((group) => (
						<div key={group.date}>
							<DateSeparator date={group.date} />
							<div className="space-y-1.5">
								{group.messages.map((msg) => {
									const m = msg as Record<string, unknown>;
									const replyToData = m.replyTo as {
										id: string;
										role: string;
										content: string;
									} | null;
									const reactionsData = (m.reactions ??
										[]) as {
										id: string;
										emoji: string;
										userId: string | null;
										contactId: string | null;
									}[];

									return (
										<MessageBubble
											key={msg.id}
											id={msg.id}
											role={m.role as string}
											content={m.content as string}
											createdAt={msg.createdAt}
											error={
												m.error as
													| string
													| null
													| undefined
											}
											latencyMs={
												m.latencyMs as
													| number
													| null
													| undefined
											}
											isHighlighted={searchMatchIds.has(
												msg.id,
											)}
											deliveryStatus={
												m.deliveryStatus as
													| string
													| null
													| undefined
											}
											editedAt={
												m.editedAt as
													| string
													| null
													| undefined
											}
											deletedAt={
												m.deletedAt as
													| string
													| null
													| undefined
											}
											replyTo={replyToData}
											reactions={reactionsData}
											attachmentType={
												m.attachmentType as
													| string
													| null
													| undefined
											}
											attachmentUrl={
												m.attachmentUrl as
													| string
													| null
													| undefined
											}
											attachmentFilename={
												m.attachmentFilename as
													| string
													| null
													| undefined
											}
											attachmentMimeType={
												m.attachmentMimeType as
													| string
													| null
													| undefined
											}
											attachmentSize={
												m.attachmentSize as
													| number
													| null
													| undefined
											}
											attachmentMeta={
												m.attachmentMeta as
													| Record<string, unknown>
													| null
													| undefined
											}
											parts={
												m.parts as
													| UIMessage["parts"]
													| null
													| undefined
											}
											onReply={() =>
												setReplyTo({
													id: msg.id,
													role: m.role as string,
													content:
														m.content as string,
												})
											}
											onReact={(emoji) =>
												handleReact(msg.id, emoji)
											}
											onReactionClick={(emoji) =>
												handleReact(msg.id, emoji)
											}
											onEdit={
												(m.role as string) === "admin"
													? () =>
															setEditingMessage({
																id: msg.id,
																content:
																	m.content as string,
															})
													: undefined
											}
											onDelete={
												(m.role as string) === "admin"
													? () => handleDelete(msg.id)
													: undefined
											}
										/>
									);
								})}
							</div>
						</div>
					))}

					{isAwaitingResponse && <TypingBubble />}
				</div>
			</div>

			{/* Admin chat input */}
			<AdminChatInput
				conversationId={conversationId}
				organizationId={organizationId}
				replyTo={replyTo}
				onCancelReply={() => setReplyTo(null)}
				editingMessage={editingMessage}
				onCancelEdit={() => setEditingMessage(null)}
				onSaveEdit={handleEditSave}
			/>
		</div>
	);
}

export function ConversationDetailEmpty() {
	return (
		<div className="flex h-full items-center justify-center bg-muted/20">
			<div className="text-center">
				<LockIcon className="mx-auto mb-3 size-10 text-muted-foreground/20" />
				<p className="text-sm text-muted-foreground">
					Select a conversation to view messages
				</p>
				<p className="mt-1 text-xs text-muted-foreground/60">
					End-to-end encrypted
				</p>
			</div>
		</div>
	);
}

"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	FilterIcon,
	GlobeIcon,
	Loader2Icon,
	MessageSquareIcon,
	PinIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentsQuery } from "../hooks/use-agents";
import {
	formatChatDate,
	formatListTimestamp,
	getAvatarColor,
	getContactInitials,
} from "../lib/chat-utils";
import { ContactPhone } from "./ContactPhone";
import { ContactUsername } from "./ContactUsername";

export interface ConversationItem {
	id: string;
	externalChatId: string;
	contactId: string | null;
	contactName: string | null;
	status: string;
	pinned: boolean;
	messageCount: number;
	lastMessageAt: Date | string | null;
	createdAt: Date | string;
	agent: { id: string; name: string };
	channel: { id: string; provider: string; name: string } | null;
	customers: Array<{
		id: string;
		username: string | null;
		accountNumber: string;
	}>;
	lastMessage: {
		content: string;
		role: string;
		createdAt: Date | string;
	} | null;
}

interface Filters {
	search: string;
	agentId: string;
	channelType: string;
	status: string;
	sortBy: string;
}

function ChannelBadge({ provider }: { provider: string | undefined }) {
	if (provider === "whatsapp") {
		return (
			<span
				className={cn(
					"flex size-4 items-center justify-center rounded-full",
					"bg-emerald-500 ring-2 ring-background",
				)}
				title="WhatsApp"
				role="img"
				aria-label="WhatsApp"
			/>
		);
	}
	if (provider === "telegram") {
		return (
			<span
				className={cn(
					"flex size-4 items-center justify-center rounded-full",
					"bg-sky-500 ring-2 ring-background",
				)}
				title="Telegram"
				role="img"
				aria-label="Telegram"
			/>
		);
	}
	return (
		<span
			className={cn(
				"flex size-4 items-center justify-center rounded-full",
				"bg-muted text-muted-foreground ring-2 ring-background",
			)}
			title="Web Chat"
			role="img"
			aria-label="Web Chat"
		>
			<GlobeIcon className="size-2.5" />
		</span>
	);
}

function getRolePrefix(role: string): string {
	if (role === "admin") {
		return "Admin: ";
	}
	if (role === "assistant") {
		return "Bot: ";
	}
	return "";
}

interface DayGroup {
	key: string;
	conversations: ConversationItem[];
}

function groupConversationsByDay(items: ConversationItem[]): DayGroup[] {
	const groups: DayGroup[] = [];
	let current: DayGroup | null = null;
	for (const conv of items) {
		const anchor = conv.lastMessageAt ?? conv.createdAt;
		const key = formatChatDate(anchor);
		if (!current || current.key !== key) {
			current = { key, conversations: [] };
			groups.push(current);
		}
		current.conversations.push(conv);
	}
	return groups;
}

function ConversationCardSkeleton() {
	return (
		<div className="flex w-full items-center gap-3 px-3 py-3">
			<Skeleton className="size-11 shrink-0 rounded-full" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="h-3.5 w-32" />
					<Skeleton className="h-3 w-10" />
				</div>
				<Skeleton className="h-3 w-3/4" />
			</div>
		</div>
	);
}

export function ConversationsListPanel({
	conversations,
	isLoading,
	selectedId,
	onSelect,
	filters,
	onFiltersChange,
	renderWrapper,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
}: {
	conversations: ConversationItem[];
	isLoading: boolean;
	selectedId: string | null;
	onSelect: (id: string) => void;
	filters: Filters;
	onFiltersChange: (filters: Filters) => void;
	renderWrapper?: (conv: ConversationItem, children: ReactNode) => ReactNode;
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	onLoadMore?: () => void;
}) {
	const { agents } = useAgentsQuery();
	const [searchInput, setSearchInput] = useState(filters.search);

	// Debounce search — only react to searchInput changes, not filter object identity
	const filtersRef = useRef(filters);
	filtersRef.current = filters;
	const onFiltersChangeRef = useRef(onFiltersChange);
	onFiltersChangeRef.current = onFiltersChange;

	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchInput !== filtersRef.current.search) {
				onFiltersChangeRef.current({
					...filtersRef.current,
					search: searchInput,
				});
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const updateFilter = useCallback(
		(key: keyof Filters, value: string) => {
			onFiltersChange({ ...filters, [key]: value });
		},
		[filters, onFiltersChange],
	);

	const activeFilterCount =
		(filters.agentId ? 1 : 0) + (filters.channelType ? 1 : 0);

	// Pinned conversations float to the top, then everything else stays in the
	// server-provided order so day-groupings stay coherent.
	const { pinned, rest } = useMemo(() => {
		const p: ConversationItem[] = [];
		const r: ConversationItem[] = [];
		for (const c of conversations) {
			if (c.pinned) {
				p.push(c);
			} else {
				r.push(c);
			}
		}
		return { pinned: p, rest: r };
	}, [conversations]);

	const dayGroups = useMemo(() => groupConversationsByDay(rest), [rest]);

	const sentinelRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!onLoadMore || !hasNextPage) {
			return;
		}
		const node = sentinelRef.current;
		if (!node) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting && !isFetchingNextPage) {
					onLoadMore();
				}
			},
			{ rootMargin: "200px 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [onLoadMore, hasNextPage, isFetchingNextPage]);

	function renderCard(conv: ConversationItem, isSelected: boolean) {
		const initials = getContactInitials(conv.contactName);
		const avatarColor = getAvatarColor(conv.contactName);
		const channelProvider = conv.channel?.provider;
		const showPhoneNumber =
			conv.channel?.provider &&
			conv.channel.provider !== "web" &&
			conv.externalChatId;
		const isFlagged = conv.status === "needs_human";

		return (
			<div className="flex w-full items-start gap-3 px-3 py-3 text-left">
				{/* Avatar with channel badge */}
				<div className="relative shrink-0">
					<div
						className={cn(
							"flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ring-2",
							avatarColor,
							isSelected ? "ring-primary/30" : "ring-transparent",
						)}
					>
						{initials}
					</div>
					<div className="absolute -bottom-0.5 -right-0.5">
						<ChannelBadge provider={channelProvider} />
					</div>
				</div>

				{/* Content */}
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-1.5">
							{conv.pinned && (
								<PinIcon className="size-3 shrink-0 -rotate-45 text-primary" />
							)}
							<span
								className={cn(
									"truncate text-sm",
									isFlagged
										? "font-semibold text-warning"
										: "font-medium text-foreground",
								)}
							>
								{conv.contactName || "Unknown contact"}
							</span>
						</div>
						{conv.lastMessageAt && (
							<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
								{formatListTimestamp(conv.lastMessageAt)}
							</span>
						)}
					</div>

					{(() => {
						const primaryCustomer = conv.customers[0];
						const extraCustomers = conv.customers.length - 1;
						if (
							!showPhoneNumber &&
							!primaryCustomer?.username &&
							!primaryCustomer?.accountNumber
						) {
							return null;
						}
						return (
							<div className="mt-0.5 flex flex-wrap items-center gap-1">
								{showPhoneNumber && (
									<ContactPhone contactId={conv.contactId} />
								)}
								<ContactUsername
									username={primaryCustomer?.username}
								/>
								{primaryCustomer?.accountNumber && (
									<Badge
										variant="secondary"
										className="h-4 px-1.5 font-mono text-[10px]"
									>
										#{primaryCustomer.accountNumber}
									</Badge>
								)}
								{extraCustomers > 0 && (
									<Badge
										variant="outline"
										className="h-4 px-1.5 text-[10px]"
										title={`${extraCustomers + 1} customers share this number`}
									>
										+{extraCustomers}
									</Badge>
								)}
							</div>
						);
					})()}

					<div className="mt-1 flex items-center justify-between gap-2">
						<p className="min-w-0 truncate text-xs text-muted-foreground">
							{conv.lastMessage ? (
								<>
									<span className="font-medium text-foreground/70">
										{getRolePrefix(conv.lastMessage.role)}
									</span>
									{conv.lastMessage.content}
								</>
							) : (
								<span className="italic">No messages yet</span>
							)}
						</p>
						{isFlagged ? (
							<Badge
								variant="outline"
								className="h-4 border-warning/40 bg-warning/10 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-warning"
							>
								Needs human
							</Badge>
						) : conv.messageCount > 0 ? (
							<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
								{conv.messageCount}
							</span>
						) : null}
					</div>
				</div>
			</div>
		);
	}

	function renderRow(conv: ConversationItem) {
		const isSelected = selectedId === conv.id;
		const card = renderCard(conv, isSelected);
		const wrapperClass = cn(
			"relative block w-full border-b border-border/60 transition-colors",
			"hover:bg-muted/50 focus-within:bg-muted/50",
			isSelected && "bg-muted",
		);
		const accent = isSelected ? (
			<span
				aria-hidden
				className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary"
			/>
		) : null;

		if (renderWrapper) {
			return (
				<div key={conv.id} className={wrapperClass}>
					{accent}
					{renderWrapper(conv, card)}
				</div>
			);
		}
		return (
			<button
				key={conv.id}
				type="button"
				onClick={() => onSelect(conv.id)}
				className={cn(
					wrapperClass,
					"text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
				)}
				aria-current={isSelected ? "true" : undefined}
			>
				{accent}
				{card}
			</button>
		);
	}

	const showInitialSkeletons = isLoading && conversations.length === 0;
	const isEmpty = !isLoading && conversations.length === 0;
	const trimmedSearch = searchInput.trim();

	return (
		<div className="flex h-full flex-col">
			{/* Header with search and filter */}
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<div className="relative flex-1">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by name, phone, username..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="h-9 pr-9 pl-9"
						aria-label="Search conversations"
					/>
					{searchInput && (
						<button
							type="button"
							onClick={() => setSearchInput("")}
							className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label="Clear search"
						>
							<XIcon className="size-3.5" />
						</button>
					)}
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant={
								activeFilterCount > 0 ? "secondary" : "ghost"
							}
							size="icon"
							className="relative size-9 shrink-0"
							aria-label="Filters"
						>
							<FilterIcon className="size-4" />
							{activeFilterCount > 0 && (
								<span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
									{activeFilterCount}
								</span>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-60 space-y-3 p-3">
						<div>
							<span className="mb-1 block text-xs font-medium text-muted-foreground">
								Agent
							</span>
							<Select
								value={filters.agentId || "all"}
								onValueChange={(v) =>
									updateFilter(
										"agentId",
										v === "all" ? "" : v,
									)
								}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue placeholder="All agents" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All agents
									</SelectItem>
									{agents.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<span className="mb-1 block text-xs font-medium text-muted-foreground">
								Channel
							</span>
							<Select
								value={filters.channelType || "all"}
								onValueChange={(v) =>
									updateFilter(
										"channelType",
										v === "all" ? "" : v,
									)
								}
							>
								<SelectTrigger className="h-8 text-xs">
									<SelectValue placeholder="All channels" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="web">
										Web Chat
									</SelectItem>
									<SelectItem value="whatsapp">
										WhatsApp
									</SelectItem>
									<SelectItem value="telegram">
										Telegram
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{activeFilterCount > 0 && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 w-full text-xs"
								onClick={() =>
									onFiltersChange({
										...filters,
										agentId: "",
										channelType: "",
									})
								}
							>
								Clear filters
							</Button>
						)}
					</PopoverContent>
				</Popover>
			</div>

			{/* Conversation list */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{showInitialSkeletons && (
					<div>
						{Array.from({ length: 6 }).map((_, i) => (
							<div
								key={`sk-${i}`}
								className="border-b border-border/60"
							>
								<ConversationCardSkeleton />
							</div>
						))}
					</div>
				)}

				{isEmpty && (
					<div className="flex flex-col items-center justify-center px-6 py-20 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-muted">
							<MessageSquareIcon className="size-5 text-muted-foreground/70" />
						</div>
						<p className="mt-3 text-sm font-medium text-foreground">
							{trimmedSearch || activeFilterCount > 0
								? "No matches"
								: "No conversations yet"}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{trimmedSearch
								? `Nothing matches “${trimmedSearch}”.`
								: activeFilterCount > 0
									? "Try clearing your filters."
									: "New chats will appear here as soon as they arrive."}
						</p>
					</div>
				)}

				{pinned.length > 0 && (
					<DaySection label="Pinned" tone="primary">
						{pinned.map(renderRow)}
					</DaySection>
				)}

				{dayGroups.map((group) => (
					<DaySection key={group.key} label={group.key}>
						{group.conversations.map(renderRow)}
					</DaySection>
				))}

				{hasNextPage && (
					<div
						ref={sentinelRef}
						className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
					>
						<Loader2Icon className="size-3.5 animate-spin" />
						Loading more…
					</div>
				)}
				{!hasNextPage && !isLoading && conversations.length > 0 && (
					<div className="px-3 py-4 text-center text-[10px] uppercase tracking-wider text-muted-foreground/60">
						End of conversations
					</div>
				)}
			</div>
		</div>
	);
}

function DaySection({
	label,
	tone,
	children,
}: {
	label: string;
	tone?: "primary";
	children: ReactNode;
}) {
	return (
		<section>
			<div
				className={cn(
					"sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur",
					"text-[10px] font-semibold uppercase tracking-wider",
					tone === "primary"
						? "text-primary"
						: "text-muted-foreground",
				)}
			>
				<span>{label}</span>
			</div>
			{children}
		</section>
	);
}

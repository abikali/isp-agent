"use client";

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
import { cn } from "@ui/lib";
import {
	FilterIcon,
	GlobeIcon,
	MessageSquareIcon,
	PinIcon,
	SearchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAgentsQuery } from "../hooks/use-agents";
import {
	formatListTimestamp,
	getAvatarColor,
	getContactInitials,
} from "../lib/chat-utils";

export interface ConversationItem {
	id: string;
	contactName: string | null;
	status: string;
	pinned: boolean;
	messageCount: number;
	lastMessageAt: Date | string | null;
	createdAt: Date | string;
	agent: { id: string; name: string };
	channel: { id: string; provider: string; name: string } | null;
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

function ChannelDot({ provider }: { provider: string | undefined }) {
	if (provider === "whatsapp") {
		return (
			<span
				className="size-2 shrink-0 rounded-full bg-emerald-500"
				title="WhatsApp"
			/>
		);
	}
	if (provider === "telegram") {
		return (
			<span
				className="size-2 shrink-0 rounded-full bg-blue-400"
				title="Telegram"
			/>
		);
	}
	return (
		<span title="Web Chat">
			<GlobeIcon className="size-3 shrink-0 text-muted-foreground/60" />
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

export function ConversationsListPanel({
	conversations,
	isLoading,
	selectedId,
	onSelect,
	filters,
	onFiltersChange,
	renderWrapper,
}: {
	conversations: ConversationItem[];
	isLoading: boolean;
	selectedId: string | null;
	onSelect: (id: string) => void;
	filters: Filters;
	onFiltersChange: (filters: Filters) => void;
	renderWrapper?: (conv: ConversationItem, children: ReactNode) => ReactNode;
}) {
	const { agents } = useAgentsQuery();
	const [searchInput, setSearchInput] = useState(filters.search);

	// Debounce search
	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchInput !== filters.search) {
				onFiltersChange({ ...filters, search: searchInput });
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput, filters, onFiltersChange]);

	const updateFilter = useCallback(
		(key: keyof Filters, value: string) => {
			onFiltersChange({ ...filters, [key]: value });
		},
		[filters, onFiltersChange],
	);

	const hasActiveFilters = !!(filters.agentId || filters.channelType);

	// Sort: pinned first
	const sorted = [...conversations].sort((a, b) => {
		if (a.pinned && !b.pinned) {
			return -1;
		}
		if (!a.pinned && b.pinned) {
			return 1;
		}
		return 0;
	});

	function renderCard(conv: ConversationItem) {
		const initials = getContactInitials(conv.contactName);
		const avatarColor = getAvatarColor(conv.contactName);
		const channelProvider = conv.channel?.provider;

		return (
			<div className="flex w-full items-center gap-3 px-3 py-3 text-left">
				{/* Avatar */}
				<div className="relative shrink-0">
					<div
						className={cn(
							"flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white",
							avatarColor,
						)}
					>
						{initials}
					</div>
					{/* Channel indicator ring */}
					<div className="absolute -bottom-0.5 -right-0.5">
						<ChannelDot provider={channelProvider} />
					</div>
				</div>

				{/* Content */}
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-1.5">
							{conv.pinned && (
								<PinIcon className="size-3 shrink-0 text-primary" />
							)}
							<span className="truncate text-sm font-medium">
								{conv.contactName || "Unknown Contact"}
							</span>
						</div>
						{conv.lastMessageAt && (
							<span className="shrink-0 text-[11px] text-muted-foreground">
								{formatListTimestamp(conv.lastMessageAt)}
							</span>
						)}
					</div>
					<div className="mt-0.5 flex items-center justify-between gap-2">
						<p className="min-w-0 truncate text-xs text-muted-foreground">
							{conv.lastMessage ? (
								<>
									<span className="font-medium">
										{getRolePrefix(conv.lastMessage.role)}
									</span>
									{conv.lastMessage.content}
								</>
							) : (
								<span className="italic">No messages yet</span>
							)}
						</p>
						{conv.messageCount > 0 && !conv.lastMessage && (
							<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
								{conv.messageCount}
							</span>
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header with search and filter */}
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<div className="relative flex-1">
					<SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search contacts..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="h-9 pl-9"
					/>
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"size-9 shrink-0",
								hasActiveFilters && "text-primary",
							)}
						>
							<FilterIcon className="size-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-56 space-y-3 p-3">
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
					</PopoverContent>
				</Popover>
			</div>

			{/* Conversation list */}
			<div className="flex-1 overflow-y-auto">
				{sorted.length === 0 && !isLoading && (
					<div className="flex flex-col items-center justify-center py-16">
						<MessageSquareIcon className="mb-3 size-8 text-muted-foreground/50" />
						<p className="text-sm text-muted-foreground">
							No conversations found
						</p>
					</div>
				)}

				{sorted.map((conv) => {
					const card = renderCard(conv);
					if (renderWrapper) {
						return (
							<div
								key={conv.id}
								className={cn(
									"border-b transition-colors hover:bg-muted/50",
									selectedId === conv.id && "bg-muted",
								)}
							>
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
								"w-full border-b transition-colors hover:bg-muted/50",
								selectedId === conv.id && "bg-muted",
							)}
						>
							{card}
						</button>
					);
				})}
			</div>
		</div>
	);
}

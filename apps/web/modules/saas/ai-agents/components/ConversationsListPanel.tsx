"use client";

import { Badge } from "@ui/components/badge";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { cn } from "@ui/lib";
import { BotIcon, MessageSquareIcon, PinIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAgentsQuery } from "../hooks/use-agents";

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

	function getChannelLabel(channel: ConversationItem["channel"]): string {
		if (!channel) {
			return "Web Chat";
		}
		return channel.provider === "whatsapp" ? "WhatsApp" : "Telegram";
	}

	function getRoleLabel(role: string): string {
		if (role === "admin") {
			return "Admin: ";
		}
		if (role === "assistant") {
			return "Bot: ";
		}
		return "User: ";
	}

	function renderCard(conv: ConversationItem) {
		return (
			<div
				className={cn(
					"flex w-full items-start gap-3 px-3 py-3 text-left",
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						{conv.pinned && (
							<PinIcon className="size-3 shrink-0 text-primary" />
						)}
						<span className="truncate text-sm font-medium">
							{conv.contactName || "Unknown Contact"}
						</span>
						<Badge
							variant="outline"
							className="shrink-0 text-[10px]"
						>
							{getChannelLabel(conv.channel)}
						</Badge>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5">
						<BotIcon className="size-3 shrink-0 text-muted-foreground/60" />
						<span className="truncate text-xs text-muted-foreground/60">
							{conv.agent.name}
						</span>
					</div>
					{conv.lastMessage && (
						<p className="mt-1 truncate text-xs text-muted-foreground">
							<span className="font-medium">
								{getRoleLabel(conv.lastMessage.role)}
							</span>
							{conv.lastMessage.content}
						</p>
					)}
				</div>
				<div className="shrink-0 text-right">
					<p className="text-[10px] text-muted-foreground">
						{conv.messageCount} msg
						{conv.messageCount !== 1 ? "s" : ""}
					</p>
					{conv.lastMessageAt && (
						<p className="text-[10px] text-muted-foreground">
							{new Date(conv.lastMessageAt).toLocaleDateString()}
						</p>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Search */}
			<div className="border-b p-3">
				<div className="relative">
					<SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search contacts..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			{/* Filters */}
			<div className="flex gap-2 border-b px-3 py-2">
				<Select
					value={filters.agentId || "all"}
					onValueChange={(v) =>
						updateFilter("agentId", v === "all" ? "" : v)
					}
				>
					<SelectTrigger className="h-8 flex-1 text-xs">
						<SelectValue placeholder="All agents" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All agents</SelectItem>
						{agents.map((a) => (
							<SelectItem key={a.id} value={a.id}>
								{a.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={filters.channelType || "all"}
					onValueChange={(v) =>
						updateFilter("channelType", v === "all" ? "" : v)
					}
				>
					<SelectTrigger className="h-8 w-28 text-xs">
						<SelectValue placeholder="All channels" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All</SelectItem>
						<SelectItem value="web">Web Chat</SelectItem>
						<SelectItem value="whatsapp">WhatsApp</SelectItem>
						<SelectItem value="telegram">Telegram</SelectItem>
					</SelectContent>
				</Select>
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

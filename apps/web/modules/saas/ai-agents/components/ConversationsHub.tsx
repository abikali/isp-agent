"use client";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { useAllConversations } from "../hooks/use-all-conversations";
import {
	ConversationDetailEmpty,
	ConversationDetailPanel,
} from "./ConversationDetailPanel";
import {
	type ConversationItem,
	ConversationsListPanel,
} from "./ConversationsListPanel";

interface Filters {
	search: string;
	agentId: string;
	channelType: string;
	status: string;
	sortBy: string;
}

export function ConversationsHub({
	organizationId,
	organizationSlug,
}: {
	organizationId: string;
	organizationSlug: string;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [filters, setFilters] = useState<Filters>({
		search: "",
		agentId: "",
		channelType: "",
		status: "",
		sortBy: "lastMessageAt",
	});

	const { conversations, isLoading } = useAllConversations(organizationId, {
		search: filters.search || undefined,
		agentId: filters.agentId || undefined,
		channelType:
			(filters.channelType as "web" | "whatsapp" | "telegram") ||
			undefined,
		status: (filters.status as "active" | "archived") || undefined,
		sortBy:
			(filters.sortBy as
				| "lastMessageAt"
				| "messageCount"
				| "createdAt") || undefined,
	});

	const selectedConversation = conversations.find((c) => c.id === selectedId);

	const handleSelect = useCallback((id: string) => {
		setSelectedId(id);
	}, []);

	const handleFiltersChange = useCallback((newFilters: Filters) => {
		setFilters(newFilters);
	}, []);

	const mobileWrapper = useCallback(
		(conv: ConversationItem, children: ReactNode) => (
			<Link
				to="/app/$organizationSlug/conversations/$conversationId"
				params={{
					organizationSlug,
					conversationId: conv.id,
				}}
				className="block"
			>
				{children}
			</Link>
		),
		[organizationSlug],
	);

	return (
		<div className="flex h-[calc(100vh-200px)] overflow-hidden rounded-lg border border-border">
			{/* List panel - desktop: click to select; mobile: links */}
			<div className="w-full border-r border-border md:w-[350px] md:shrink-0">
				{/* Desktop */}
				<div className="hidden h-full md:block">
					<ConversationsListPanel
						conversations={conversations}
						isLoading={isLoading}
						selectedId={selectedId}
						onSelect={handleSelect}
						filters={filters}
						onFiltersChange={handleFiltersChange}
					/>
				</div>

				{/* Mobile */}
				<div className="h-full md:hidden">
					<ConversationsListPanel
						conversations={conversations}
						isLoading={isLoading}
						selectedId={null}
						onSelect={() => {}}
						filters={filters}
						onFiltersChange={handleFiltersChange}
						renderWrapper={mobileWrapper}
					/>
				</div>
			</div>

			{/* Detail panel - desktop only */}
			<div className="hidden flex-1 md:block">
				{selectedId ? (
					<ConversationDetailPanel
						conversationId={selectedId}
						organizationId={organizationId}
						organizationSlug={organizationSlug}
						pinned={selectedConversation?.pinned}
					/>
				) : (
					<ConversationDetailEmpty />
				)}
			</div>
		</div>
	);
}

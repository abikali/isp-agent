"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAllConversations } from "../hooks/use-all-conversations";
import { ConversationContextPanel } from "./ConversationContextPanel";
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
	const [showContext, setShowContext] = useState(true);
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

	const orderedConversations = [...conversations].sort((a, b) => {
		if (a.status === "needs_human" && b.status !== "needs_human") {
			return -1;
		}
		if (b.status === "needs_human" && a.status !== "needs_human") {
			return 1;
		}
		if (a.pinned !== b.pinned) {
			return a.pinned ? -1 : 1;
		}
		return 0;
	});

	const selectedConversation = orderedConversations.find(
		(c) => c.id === selectedId,
	);

	const handleSelect = useCallback((id: string) => {
		setSelectedId(id);
	}, []);

	const handleFiltersChange = useCallback((newFilters: Filters) => {
		setFilters(newFilters);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable
			) {
				return;
			}
			const idx = orderedConversations.findIndex(
				(c) => c.id === selectedId,
			);
			if (e.key === "j") {
				e.preventDefault();
				const next =
					orderedConversations[
						Math.min(orderedConversations.length - 1, idx + 1)
					];
				if (next) {
					setSelectedId(next.id);
				}
			} else if (e.key === "k") {
				e.preventDefault();
				const prev = orderedConversations[Math.max(0, idx - 1)];
				if (prev) {
					setSelectedId(prev.id);
				}
			} else if (e.key === "Escape" && selectedId) {
				e.preventDefault();
				setSelectedId(null);
			} else if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setShowContext((s) => !s);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [orderedConversations, selectedId]);

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
		<div className="flex h-[calc(100vh-130px)] overflow-hidden">
			<div className="w-full border-r border-border md:w-[360px] md:shrink-0">
				<div className="hidden h-full md:block">
					<ConversationsListPanel
						conversations={orderedConversations}
						isLoading={isLoading}
						selectedId={selectedId}
						onSelect={handleSelect}
						filters={filters}
						onFiltersChange={handleFiltersChange}
					/>
				</div>
				<div className="h-full md:hidden">
					<ConversationsListPanel
						conversations={orderedConversations}
						isLoading={isLoading}
						selectedId={null}
						onSelect={() => {}}
						filters={filters}
						onFiltersChange={handleFiltersChange}
						renderWrapper={mobileWrapper}
					/>
				</div>
			</div>

			<div
				className={cn(
					"relative hidden flex-1 md:flex md:flex-col",
					"min-w-0",
				)}
			>
				{selectedId ? (
					<>
						<div className="absolute right-3 top-3 z-10 hidden lg:block">
							<Button
								variant="outline"
								size="icon"
								className="size-7"
								onClick={() => setShowContext((s) => !s)}
								title={
									showContext
										? "Hide context (⌘I)"
										: "Show context (⌘I)"
								}
							>
								{showContext ? (
									<PanelRightCloseIcon className="size-3.5" />
								) : (
									<PanelRightOpenIcon className="size-3.5" />
								)}
							</Button>
						</div>
						<ConversationDetailPanel
							conversationId={selectedId}
							organizationId={organizationId}
							organizationSlug={organizationSlug}
							pinned={selectedConversation?.pinned}
						/>
					</>
				) : (
					<ConversationDetailEmpty />
				)}
			</div>

			{showContext && (
				<aside className="hidden w-[320px] shrink-0 border-l border-border lg:block">
					<ConversationContextPanel
						conversation={selectedConversation}
						organizationSlug={organizationSlug}
					/>
				</aside>
			)}
		</div>
	);
}

"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	ArrowUpRightIcon,
	BotIcon,
	CalendarIcon,
	MessageSquareIcon,
	UserIcon,
} from "lucide-react";
import type { ConversationItem } from "./ConversationsListPanel";

interface ConversationContextPanelProps {
	conversation: ConversationItem | undefined;
	organizationSlug: string;
	onClose?: () => void;
}

function fmtRelative(d: Date | string | null): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	const diffMs = Date.now() - date.getTime();
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) {
		return "Just now";
	}
	if (mins < 60) {
		return `${mins}m ago`;
	}
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) {
		return `${hrs}h ago`;
	}
	return `${Math.floor(hrs / 24)}d ago`;
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-2 px-4 py-3">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{title}
			</div>
			{children}
		</section>
	);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate text-right font-medium">{value}</span>
		</div>
	);
}

export function ConversationContextPanel({
	conversation,
	organizationSlug,
}: ConversationContextPanelProps) {
	if (!conversation) {
		return (
			<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
				Select a conversation to see context
			</div>
		);
	}

	const isAiFlagged = conversation.status === "needs_human";

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			{isAiFlagged && (
				<div className="border-b border-warning/30 bg-warning/5 px-4 py-2 text-xs font-medium text-warning">
					⚠ Flagged for human review
				</div>
			)}

			<Section title="Contact">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
							"bg-accent text-foreground",
						)}
					>
						<UserIcon className="size-4 opacity-70" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">
							{conversation.contactName ?? "Anonymous"}
						</div>
						<div className="truncate font-mono text-[11px] text-muted-foreground">
							{conversation.externalChatId}
						</div>
					</div>
				</div>
			</Section>

			{conversation.customer && (
				<Section title="Linked customer">
					<Button
						asChild
						variant="outline"
						size="sm"
						className="h-auto w-full justify-between p-2 text-xs"
					>
						<Link
							to="/app/$organizationSlug/customers/$customerId"
							params={{
								organizationSlug,
								customerId: conversation.customer.id,
							}}
						>
							<div className="min-w-0 text-left">
								<div className="truncate font-medium">
									#{conversation.customer.accountNumber}
								</div>
								{conversation.customer.username && (
									<div className="truncate font-mono text-[10px] text-muted-foreground">
										{conversation.customer.username}
									</div>
								)}
							</div>
							<ArrowUpRightIcon className="size-3.5 shrink-0" />
						</Link>
					</Button>
				</Section>
			)}

			<Section title="Agent">
				<Row
					label="Name"
					value={
						<span className="inline-flex items-center gap-1">
							<BotIcon className="size-3 text-muted-foreground" />
							{conversation.agent.name}
						</span>
					}
				/>
				{conversation.channel && (
					<>
						<Row
							label="Channel"
							value={
								<Badge
									variant="outline"
									className="text-[10px] capitalize"
								>
									{conversation.channel.provider}
								</Badge>
							}
						/>
						<Row
							label="Channel name"
							value={conversation.channel.name}
						/>
					</>
				)}
			</Section>

			<Section title="Stats">
				<Row
					label="Messages"
					value={
						<span className="inline-flex items-center gap-1 tabular-nums">
							<MessageSquareIcon className="size-3" />
							{conversation.messageCount}
						</span>
					}
				/>
				<Row
					label="Last message"
					value={fmtRelative(conversation.lastMessageAt)}
				/>
				<Row
					label="Created"
					value={
						<span className="inline-flex items-center gap-1">
							<CalendarIcon className="size-3" />
							{fmtRelative(conversation.createdAt)}
						</span>
					}
				/>
				<Row
					label="Status"
					value={
						<Badge
							variant="outline"
							className="text-[10px] capitalize"
						>
							{conversation.status.replace("_", " ")}
						</Badge>
					}
				/>
			</Section>
		</div>
	);
}

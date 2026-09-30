"use client";

import { formatDateTime } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Checkbox } from "@ui/components/checkbox";
import {
	FOLLOW_UP_OUTCOME_LABELS,
	FOLLOW_UP_SKIP_LABELS,
	FOLLOW_UP_STATUS_LABELS,
	FOLLOW_UP_TYPE_LABELS,
} from "../lib/bot-follow-up-labels";

export interface BotFollowUpItem {
	id: string;
	type: string;
	channel: string;
	status: string;
	outcome: string | null;
	reason: string | null;
	skipReason: string | null;
	dueAt: Date | string | null;
	sentAt: Date | string | null;
	messageText: string | null;
	reply: string | null;
	conversationId: string | null;
	taskId: string | null;
	customerId: string | null;
	stopNote?: string | null;
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
	} | null;
}

const WHEN_FORMAT = {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
} as const;

/**
 * One follow-up: when, who, what kind, where it stands, and what came of it.
 * `onSelect` turns on the approval checkbox.
 */
export function BotFollowUpRow({
	item,
	organizationSlug,
	selected,
	onSelect,
	showCustomer = true,
}: {
	item: BotFollowUpItem;
	organizationSlug: string;
	selected?: boolean;
	onSelect?: (checked: boolean) => void;
	showCustomer?: boolean;
}) {
	const when = item.sentAt ?? item.dueAt;
	const name =
		[item.customer?.firstName, item.customer?.lastName]
			.filter(Boolean)
			.join(" ") || "Unknown customer";
	const detail =
		item.reply ??
		item.reason ??
		(item.skipReason
			? (FOLLOW_UP_SKIP_LABELS[item.skipReason] ?? item.skipReason)
			: null);
	const showPreview =
		item.status === "pending_approval" || item.status === "scheduled";

	return (
		<div className="flex items-start gap-3 border-b border-border/60 px-4 py-3 text-sm last:border-b-0">
			{onSelect && (
				<Checkbox
					className="mt-1"
					checked={selected}
					onCheckedChange={(v) => onSelect(v === true)}
					aria-label={`Select follow-up for ${name}`}
				/>
			)}
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					{showCustomer &&
						(item.customerId ? (
							<Link
								to="/app/$organizationSlug/customers/$customerId"
								params={{
									organizationSlug,
									customerId: item.customerId,
								}}
								className="font-medium hover:underline"
							>
								{name}
								{item.customer?.username && (
									<span className="ml-1 font-mono text-xs text-muted-foreground">
										{item.customer.username}
									</span>
								)}
							</Link>
						) : (
							<span className="font-medium">{name}</span>
						))}
					<Badge variant="outline">
						{FOLLOW_UP_TYPE_LABELS[item.type] ?? item.type}
					</Badge>
					<Badge variant="secondary">
						{item.channel === "official" ? "Official" : "Bot"}
					</Badge>
					<Badge
						variant={
							item.status === "failed"
								? "destructive"
								: "secondary"
						}
					>
						{FOLLOW_UP_STATUS_LABELS[item.status] ?? item.status}
					</Badge>
					{item.outcome && (
						<Badge
							variant={
								item.outcome === "bad" ||
								item.outcome === "unresolved"
									? "destructive"
									: "default"
							}
						>
							{FOLLOW_UP_OUTCOME_LABELS[item.outcome] ??
								item.outcome}
						</Badge>
					)}
				</div>
				{showPreview && item.messageText && (
					<p className="line-clamp-3 text-xs text-muted-foreground">
						{item.messageText}
					</p>
				)}
				{detail && (
					<p className="line-clamp-2 text-xs">
						{item.reply ? "↩ " : ""}
						{detail}
					</p>
				)}
				{item.stopNote && (
					<p className="text-xs text-muted-foreground">
						Collector note: {item.stopNote}
					</p>
				)}
				<div className="flex flex-wrap gap-3 text-xs">
					{item.conversationId && (
						<Link
							to="/app/$organizationSlug/conversations/$conversationId"
							params={{
								organizationSlug,
								conversationId: item.conversationId,
							}}
							className="text-primary hover:underline"
						>
							Conversation
						</Link>
					)}
					{item.taskId && (
						<Link
							to="/app/$organizationSlug/escalations/$taskId"
							params={{ organizationSlug, taskId: item.taskId }}
							className="text-primary hover:underline"
						>
							Task
						</Link>
					)}
				</div>
			</div>
			<div className="shrink-0 text-right text-xs text-muted-foreground">
				{when ? formatDateTime(when, WHEN_FORMAT) : "—"}
				<div>{item.sentAt ? "sent" : "due"}</div>
			</div>
		</div>
	);
}

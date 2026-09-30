"use client";

import { formatDateTime } from "@shared/lib/format";
import {
	MOOD_LABELS,
	SUMMARY_OUTCOME_LABELS,
} from "../lib/bot-follow-up-labels";

export interface ConversationSummaryItem {
	id: string;
	toAt: Date | string;
	outcome: string;
	customerMood: string;
	summary: string;
	botActions: string | null;
	openItems: string | null;
}

/** One episode summary: outcome, mood, what happened, what is pending. */
export function ConversationSummaryCard({
	summary,
}: {
	summary: ConversationSummaryItem;
}) {
	return (
		<div className="space-y-1 rounded-md border border-border/60 p-2.5 text-xs">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium">
					{SUMMARY_OUTCOME_LABELS[summary.outcome] ?? summary.outcome}{" "}
					{MOOD_LABELS[summary.customerMood] ?? ""}
				</span>
				<span className="shrink-0 text-muted-foreground">
					{formatDateTime(summary.toAt, {
						day: "numeric",
						month: "short",
						hour: "2-digit",
						minute: "2-digit",
					})}
				</span>
			</div>
			<p className="text-foreground/90">{summary.summary}</p>
			{summary.botActions && (
				<p className="text-muted-foreground">
					<span className="font-medium">Bot did:</span>{" "}
					{summary.botActions}
				</p>
			)}
			{summary.openItems && (
				<p className="text-muted-foreground">
					<span className="font-medium">Pending:</span>{" "}
					{summary.openItems}
				</p>
			)}
		</div>
	);
}

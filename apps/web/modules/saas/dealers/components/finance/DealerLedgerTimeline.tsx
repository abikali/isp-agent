"use client";

import {
	ContentCard,
	ContentCardSection,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { formatCurrency, formatDate, formatTime } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/toggle-group";
import { cn } from "@ui/lib";
import { ReceiptTextIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { DealerLedgerEntry } from "../../hooks/use-dealer-finance";
import { LEDGER_KINDS, type LedgerKind } from "../../lib/finance-labels";

interface DealerLedgerTimelineProps {
	entries: DealerLedgerEntry[];
	dealerName: string;
}

type Filter = "all" | "given" | "received";

const FILTERS: Array<{ value: Filter; label: string }> = [
	{ value: "all", label: "Everything" },
	{ value: "given", label: "Credit given" },
	{ value: "received", label: "Money back" },
];

function inFilter(entry: DealerLedgerEntry, filter: Filter): boolean {
	if (filter === "all") {
		return true;
	}
	return filter === "given"
		? entry.direction === "up"
		: entry.direction === "down";
}

/**
 * The receivable ledger as a story, newest first. Each row says what
 * happened in words, how much, and what the dealer owed right after — the
 * "balance after" is recomputed, never the number iRadius stored.
 */
export function DealerLedgerTimeline({
	entries,
	dealerName,
}: DealerLedgerTimelineProps) {
	const [filter, setFilter] = useState<Filter>("all");

	const visible = useMemo(
		() => entries.filter((e) => inFilter(e, filter)),
		[entries, filter],
	);
	const hasLegacy = entries.some((e) => e.legacyCurrency);

	return (
		<ContentCard>
			<ContentCardToolbar
				actions={
					<span className="text-xs tabular-nums text-muted-foreground">
						{visible.length}{" "}
						{visible.length === 1 ? "entry" : "entries"}
					</span>
				}
			>
				<ToggleGroup
					type="single"
					size="sm"
					variant="outline"
					value={filter}
					onValueChange={(value) => {
						if (value) {
							setFilter(value as Filter);
						}
					}}
					aria-label="Filter the ledger"
				>
					{FILTERS.map((f) => (
						<ToggleGroupItem key={f.value} value={f.value}>
							{f.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</ContentCardToolbar>

			{visible.length === 0 ? (
				<EmptyState
					icon={ReceiptTextIcon}
					title="Nothing here yet"
					description={`No money has moved between you and ${dealerName}${filter === "all" ? "" : " in this category"}.`}
				/>
			) : (
				<ul>
					{visible.map((entry) => (
						<TimelineRow key={entry.id} entry={entry} />
					))}
				</ul>
			)}

			{hasLegacy && (
				<ContentCardSection className="border-t border-border text-xs text-muted-foreground">
					Rows marked <Badge variant="outline">old currency</Badge>{" "}
					are 2023 entries recorded in Lebanese pounds. They cancel
					each other out and are left out of the 12-month totals.
				</ContentCardSection>
			)}
		</ContentCard>
	);
}

function TimelineRow({ entry }: { entry: DealerLedgerEntry }) {
	const meta = LEDGER_KINDS[entry.kind as LedgerKind];
	const Icon = meta.icon;
	const up = entry.direction === "up";

	return (
		<li className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
			<div
				className={cn(
					"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
					meta.chip,
				)}
			>
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="text-sm font-medium">{meta.label}</span>
					{entry.legacyCurrency && (
						<Badge variant="outline">old currency</Badge>
					)}
					<span className="text-xs text-muted-foreground">
						{formatDate(entry.operationDate, {
							dateStyle: "medium",
						})}{" "}
						{formatTime(entry.operationDate, {
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				</div>
				<p className="truncate text-sm text-muted-foreground">
					{entry.note ?? meta.meaning}
				</p>
			</div>
			<div className="shrink-0 text-right">
				<div
					className={cn(
						"font-mono text-sm font-medium tabular-nums",
						up ? "text-foreground" : "text-success",
					)}
				>
					{up ? "+" : "−"}
					{formatCurrency(entry.amount)}
				</div>
				<div className="text-xs tabular-nums text-muted-foreground">
					{entry.balanceAfter === 0
						? "settled"
						: entry.balanceAfter > 0
							? `owes ${formatCurrency(entry.balanceAfter)}`
							: `in credit ${formatCurrency(-entry.balanceAfter)}`}
				</div>
			</div>
		</li>
	);
}

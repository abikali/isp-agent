"use client";

import { formatCurrency } from "@shared/lib/format";
import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";

export interface MoneyTileProps {
	icon: LucideIcon;
	label: string;
	value: number;
	/** One plain sentence under the number: what it means, or what to do. */
	line: string;
	tone: "good" | "attention" | "warn" | "neutral";
	active?: boolean;
	/** When set the tile is a filter on the content below it. */
	onClick?: () => void;
}

const TONE = {
	good: "text-success",
	attention: "text-foreground",
	warn: "text-warning",
	neutral: "text-foreground",
} as const;

/**
 * One headline number for an owner page. Used in threes at the top of the
 * money pages (Dealers, Spending) — each tile a filter, so "who?" is one
 * click from "how much?".
 */
export function MoneyTile({
	icon: Icon,
	label,
	value,
	line,
	tone,
	active,
	onClick,
}: MoneyTileProps) {
	const interactive = !!onClick;
	const body = (
		<>
			<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				<Icon className="size-3.5" />
				{label}
			</div>
			<div
				className={cn(
					"mt-2 text-3xl font-medium tabular-nums leading-none tracking-tight",
					TONE[tone],
				)}
			>
				{formatCurrency(value)}
			</div>
			<p className="mt-2 text-sm text-muted-foreground">{line}</p>
			{interactive && (
				<div className="mt-3 text-xs font-medium text-muted-foreground group-hover:text-foreground">
					{active ? "Showing these below ↓" : "Show them below ↓"}
				</div>
			)}
		</>
	);

	const className = cn(
		"group block w-full rounded-xl border bg-card p-5 text-left shadow-xs transition-colors",
		active
			? "border-foreground/40 ring-1 ring-foreground/10"
			: "border-border",
		interactive && "hover:border-foreground/20",
	);

	if (!interactive) {
		return <div className={className}>{body}</div>;
	}
	return (
		<button type="button" onClick={onClick} className={className}>
			{body}
		</button>
	);
}

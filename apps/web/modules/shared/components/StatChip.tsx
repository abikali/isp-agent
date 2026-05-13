"use client";

import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";

export interface StatChipProps {
	label: string;
	value: number | string;
	/** Period-over-period change (signed). Renders the up/down icon + percent. */
	delta?: number;
	icon?: LucideIcon;
	tone?: "default" | "online" | "offline" | "warning" | "info";
	/** Renders as an interactive button (e.g. clickable filter chip). */
	onClick?: () => void;
	/** Active visual treatment when the chip is the current filter. */
	active?: boolean;
	/** Format value as currency, percent, or raw. Default raw. */
	format?: "raw" | "currency" | "percent";
	className?: string;
}

const toneClasses: Record<NonNullable<StatChipProps["tone"]>, string> = {
	default: "",
	online: "text-online",
	offline: "text-offline",
	warning: "text-warning-foreground",
	info: "text-info-foreground",
};

/**
 * Compact statistic chip used in stat strips and dashboard hero rows.
 *
 * Layout: icon · label / animated value · optional delta. Doubles as a filter
 * toggle on list pages (pass `onClick` + `active`).
 */
export function StatChip({
	label,
	value,
	delta,
	icon: Icon,
	tone = "default",
	onClick,
	active,
	format = "raw",
	className,
}: StatChipProps) {
	const numericValue = typeof value === "number" ? value : null;

	const inner = (
		<>
			{Icon && (
				<Icon
					className={cn(
						"size-4 shrink-0 text-muted-foreground",
						active && "text-foreground",
					)}
				/>
			)}
			<div className="flex min-w-0 flex-col items-start">
				<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</span>
				<span
					className={cn(
						"flex items-baseline gap-1.5 text-lg font-medium tabular-nums leading-tight",
						toneClasses[tone],
					)}
				>
					{numericValue !== null ? (
						<AnimatedNumber value={numericValue} format={format} />
					) : (
						<span>{value}</span>
					)}
					{delta != null && delta !== 0 && (
						<span
							className={cn(
								"inline-flex items-center gap-0.5 text-xs font-normal",
								delta > 0 ? "text-online" : "text-offline",
							)}
						>
							{delta > 0 ? (
								<ArrowUpIcon className="size-3" />
							) : (
								<ArrowDownIcon className="size-3" />
							)}
							{Math.abs(delta).toFixed(1)}%
						</span>
					)}
				</span>
			</div>
		</>
	);

	const baseClass = cn(
		"flex min-w-[140px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors",
		onClick && "hover:bg-accent/40 cursor-pointer",
		active && "border-foreground bg-accent",
		className,
	);

	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={baseClass}>
				{inner}
			</button>
		);
	}
	return <div className={baseClass}>{inner}</div>;
}

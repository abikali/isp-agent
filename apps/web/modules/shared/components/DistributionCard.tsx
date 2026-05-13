"use client";

import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";

export interface DistributionSlice {
	label: string;
	value: number;
	color: string;
}

interface DistributionCardProps {
	title: string;
	subtitle?: string;
	icon?: LucideIcon;
	slices: DistributionSlice[];
	total?: number;
	totalLabel?: string;
	footer?: React.ReactNode;
	className?: string;
}

/**
 * Dense distribution card built around a horizontal stacked bar + ranked
 * legend. Replaces the previous donut-only layout that left big empty
 * regions of the card unused.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │ Title                Total · subtitle │
 *   │ ████████████░░░░░░░░░░░░░░░ (stacked) │
 *   │ ● Online              1,947     91%   │
 *   │ ● Offline               181      9%   │
 *   └────────────────────────────────────────┘
 */
export function DistributionCard({
	title,
	subtitle,
	icon: Icon,
	slices,
	total,
	totalLabel,
	footer,
	className,
}: DistributionCardProps) {
	const sum = total ?? slices.reduce((a, s) => a + s.value, 0);
	const hasData = sum > 0;
	const ordered = [...slices]
		.filter((s) => s.value > 0)
		.sort((a, b) => b.value - a.value);

	return (
		<div
			className={cn(
				"group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm",
				className,
			)}
		>
			<div className="flex items-baseline justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					{Icon && (
						<Icon className="size-3.5 shrink-0 text-muted-foreground" />
					)}
					<h3 className="truncate text-sm font-medium">{title}</h3>
				</div>
				<div className="flex shrink-0 items-baseline gap-1.5 text-xs">
					{hasData && (
						<span className="font-semibold tabular-nums">
							{sum.toLocaleString()}
						</span>
					)}
					{(totalLabel || subtitle) && (
						<span className="text-muted-foreground">
							{totalLabel ?? subtitle}
						</span>
					)}
				</div>
			</div>

			{hasData ? (
				<>
					{/* Stacked horizontal bar */}
					<div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
						{ordered.map((s, i) => {
							const widthPct = (s.value / sum) * 100;
							return (
								<div
									key={`${s.label}-${i}`}
									className={cn(
										"h-full transition-all",
										i > 0 && "border-l border-card",
									)}
									style={{
										width: `${widthPct}%`,
										backgroundColor: s.color,
									}}
									title={`${s.label}: ${s.value} (${widthPct.toFixed(1)}%)`}
								/>
							);
						})}
					</div>

					{/* Ranked legend */}
					<ul className="space-y-1.5">
						{ordered.map((s) => {
							const pct = (s.value / sum) * 100;
							return (
								<li
									key={s.label}
									className="grid grid-cols-[8px_1fr_auto_auto] items-center gap-2 text-xs"
								>
									<span
										className="size-2 shrink-0 rounded-full"
										style={{ backgroundColor: s.color }}
										aria-hidden
									/>
									<span className="truncate text-muted-foreground">
										{s.label}
									</span>
									<span className="font-medium tabular-nums">
										{s.value.toLocaleString()}
									</span>
									<span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
										{pct.toFixed(0)}%
									</span>
								</li>
							);
						})}
					</ul>
				</>
			) : (
				<div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
					No data
				</div>
			)}

			{footer && (
				<div className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground">
					{footer}
				</div>
			)}
		</div>
	);
}

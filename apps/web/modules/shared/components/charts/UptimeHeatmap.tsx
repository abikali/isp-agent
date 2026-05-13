"use client";

import { cn } from "@ui/lib";

export interface UptimeCell {
	date: string;
	value: number;
}

interface UptimeHeatmapProps {
	data: UptimeCell[];
	weeks?: number;
	className?: string;
	label?: string;
}

function intensityClass(value: number): string {
	if (value <= 0) {
		return "bg-muted/40";
	}
	if (value < 25) {
		return "bg-[color-mix(in_oklch,var(--chart-1)_18%,var(--muted))]";
	}
	if (value < 50) {
		return "bg-[color-mix(in_oklch,var(--chart-1)_38%,var(--muted))]";
	}
	if (value < 75) {
		return "bg-[color-mix(in_oklch,var(--chart-1)_60%,var(--muted))]";
	}
	if (value < 100) {
		return "bg-[color-mix(in_oklch,var(--chart-1)_80%,transparent)]";
	}
	return "bg-[var(--chart-1)]";
}

export function UptimeHeatmap({
	data,
	weeks = 12,
	className,
	label = "Online %",
}: UptimeHeatmapProps) {
	const cells = data.slice(-weeks * 7);
	while (cells.length < weeks * 7) {
		cells.unshift({ date: "", value: -1 });
	}

	const cols: UptimeCell[][] = [];
	for (let i = 0; i < weeks; i++) {
		cols.push(cells.slice(i * 7, i * 7 + 7));
	}

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex gap-[3px]">
				{cols.map((col, ci) => (
					<div key={ci} className="flex flex-col gap-[3px]">
						{col.map((cell, ri) => (
							<div
								key={`${ci}-${ri}`}
								title={
									cell.date
										? `${cell.date}: ${cell.value}%`
										: undefined
								}
								className={cn(
									"size-3 rounded-[2px]",
									cell.value < 0
										? "bg-transparent"
										: intensityClass(cell.value),
								)}
							/>
						))}
					</div>
				))}
			</div>
			<div className="flex items-center justify-between text-[10px] text-muted-foreground">
				<span className="uppercase tracking-wider">{label}</span>
				<div className="flex items-center gap-1">
					<span>Less</span>
					{[10, 35, 60, 85, 100].map((v) => (
						<span
							key={v}
							className={cn(
								"size-2.5 rounded-[2px]",
								intensityClass(v),
							)}
						/>
					))}
					<span>More</span>
				</div>
			</div>
		</div>
	);
}

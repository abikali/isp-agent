"use client";

import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";

export interface ChartSkeletonProps {
	variant?: "line" | "bar" | "donut" | "gauge";
	className?: string;
	height?: number;
}

/**
 * Chart-shaped skeleton used while charts are loading.
 *
 * Avoids layout shift by reserving the exact aspect ratio the chart will
 * occupy. Variants mimic the silhouette of each chart type (rising line,
 * grouped bars, donut, gauge) so the transition to real data feels less
 * jarring.
 */
export function ChartSkeleton({
	variant = "line",
	className,
	height = 240,
}: ChartSkeletonProps) {
	if (variant === "donut") {
		return (
			<div
				className={cn("flex items-center justify-center", className)}
				style={{ height }}
			>
				<Skeleton className="size-40 rounded-full" />
			</div>
		);
	}
	if (variant === "gauge") {
		return (
			<div
				className={cn("flex items-center justify-center", className)}
				style={{ height }}
			>
				<Skeleton className="size-44 rounded-full" />
			</div>
		);
	}
	if (variant === "bar") {
		return (
			<div
				className={cn("flex items-end gap-2 px-2", className)}
				style={{ height }}
			>
				{[60, 80, 45, 70, 90, 55, 75, 50, 85, 65, 95, 60].map(
					(h, i) => (
						<Skeleton
							key={`bar-${i}-${h}`}
							className="flex-1 rounded-sm"
							style={{ height: `${h}%` }}
						/>
					),
				)}
			</div>
		);
	}
	// line — soft rising shape
	return (
		<div className={cn("relative", className)} style={{ height }}>
			<svg
				className="size-full"
				viewBox="0 0 400 200"
				fill="none"
				aria-hidden="true"
			>
				<title>Loading chart</title>
				<path
					d="M0 160 Q 80 120 130 100 T 250 70 T 400 30"
					stroke="currentColor"
					strokeOpacity="0.18"
					strokeWidth="2"
					fill="none"
					strokeDasharray="6 8"
				/>
			</svg>
			<div className="absolute inset-0 flex items-end gap-1 px-2 opacity-30">
				{Array.from({ length: 24 }).map((_, i) => (
					<Skeleton
						key={`line-bar-${i}`}
						className="flex-1 rounded-sm"
						style={{ height: `${20 + Math.random() * 60}%` }}
					/>
				))}
			</div>
		</div>
	);
}

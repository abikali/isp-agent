"use client";

import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";

export interface TableSkeletonProps {
	rows?: number;
	columns?: number;
	className?: string;
	/** Show a header row skeleton. */
	header?: boolean;
}

/**
 * Generic table skeleton for list pages.
 *
 * Matches the new compact 36px row height and standard column widths so the
 * skeleton occupies the same visual footprint as real data — preventing
 * layout shift on first paint.
 */
export function TableSkeleton({
	rows = 8,
	columns = 5,
	className,
	header = true,
}: TableSkeletonProps) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border",
				className,
			)}
		>
			{header && (
				<div className="flex h-9 items-center gap-4 border-b border-border bg-muted/20 px-4">
					{Array.from({ length: columns }).map((_, i) => (
						<Skeleton key={`header-${i}`} className="h-3 flex-1" />
					))}
				</div>
			)}
			<div className="divide-y divide-border">
				{Array.from({ length: rows }).map((_, rowIdx) => (
					<div
						key={`row-${rowIdx}`}
						className="flex h-9 items-center gap-4 px-4"
					>
						{Array.from({ length: columns }).map((_, colIdx) => (
							<Skeleton
								key={`row-${rowIdx}-col-${colIdx}`}
								className={cn(
									"h-3 flex-1",
									colIdx === 0 && "max-w-[120px]",
									colIdx === columns - 1 && "max-w-[60px]",
								)}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

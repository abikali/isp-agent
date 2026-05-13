"use client";

import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";

export interface DetailSkeletonProps {
	/** Show a right sidecar skeleton (matches the customer/task workspace layout). */
	sidecar?: boolean;
	className?: string;
}

/**
 * Detail-page skeleton matching the two-column workspace pattern
 * (main column + optional right sidecar). Used by detail routes via
 * AsyncBoundary fallback.
 */
export function DetailSkeleton({
	sidecar = true,
	className,
}: DetailSkeletonProps) {
	return (
		<div
			className={cn(
				"grid gap-6",
				sidecar ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1",
				className,
			)}
		>
			<div className="space-y-6">
				{/* Hero block */}
				<div className="flex items-center gap-4">
					<Skeleton className="size-16 rounded-full" />
					<div className="space-y-2">
						<Skeleton className="h-5 w-48" />
						<Skeleton className="h-3 w-32" />
					</div>
				</div>
				{/* Section blocks */}
				<div className="space-y-3 rounded-lg border border-border p-4">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-3/4" />
				</div>
				<div className="space-y-3 rounded-lg border border-border p-4">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-2/3" />
					<Skeleton className="h-3 w-1/2" />
				</div>
			</div>
			{sidecar && (
				<aside className="space-y-4">
					<div className="space-y-2 rounded-lg border border-border p-4">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-24" />
					</div>
					<div className="space-y-2 rounded-lg border border-border p-4">
						<Skeleton className="h-3 w-12" />
						<Skeleton className="h-3 w-32" />
					</div>
				</aside>
			)}
		</div>
	);
}

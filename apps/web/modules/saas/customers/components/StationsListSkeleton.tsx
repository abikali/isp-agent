"use client";

import { Skeleton } from "@ui/components/skeleton";

export function StationsListSkeleton() {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
			<div className="flex items-center gap-2 border-b border-border p-3">
				<Skeleton className="h-9 flex-1 max-w-sm" />
				<Skeleton className="h-9 w-[140px]" />
			</div>
			<Skeleton className="h-96 rounded-none" />
		</div>
	);
}

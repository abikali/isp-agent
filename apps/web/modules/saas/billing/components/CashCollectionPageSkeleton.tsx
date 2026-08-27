"use client";

import { Skeleton } from "@ui/components/skeleton";

export function CashCollectionPageSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<Skeleton className="h-10 w-full max-w-xs" />
			<div className="grid gap-4 sm:grid-cols-3">
				<Skeleton className="h-24" />
				<Skeleton className="h-24" />
				<Skeleton className="h-24" />
			</div>
			<Skeleton className="h-64" />
		</div>
	);
}

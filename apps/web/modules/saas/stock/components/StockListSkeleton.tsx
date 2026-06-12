"use client";

import { Skeleton } from "@ui/components/skeleton";

export function StockListSkeleton() {
	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-10 w-64" />
			</div>
			<Skeleton className="h-96 rounded-lg" />
		</div>
	);
}

"use client";

import { Skeleton } from "@ui/components/skeleton";

export function CustomerStatsSkeleton() {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{Array.from({ length: 4 }).map((_, i) => (
				<Skeleton
					key={`stat-skeleton-${i}`}
					className="h-24 rounded-lg"
				/>
			))}
		</div>
	);
}

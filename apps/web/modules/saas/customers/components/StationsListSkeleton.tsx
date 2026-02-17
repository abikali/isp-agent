"use client";

import { Skeleton } from "@ui/components/skeleton";

export function StationsListSkeleton() {
	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-10 w-32" />
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton
						key={`station-skeleton-${i}`}
						className="h-40 rounded-lg"
					/>
				))}
			</div>
		</div>
	);
}

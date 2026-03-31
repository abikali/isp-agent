"use client";

import { Skeleton } from "@ui/components/skeleton";

export function TasksListSkeleton() {
	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center gap-4">
				<Skeleton className="h-10 w-full sm:w-64" />
				<Skeleton className="hidden h-10 w-32 sm:block" />
				<Skeleton className="h-10 w-32 sm:ml-auto" />
			</div>
			<div className="space-y-2">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton
						key={`row-skeleton-${i}`}
						className="h-16 rounded-lg"
					/>
				))}
			</div>
		</div>
	);
}

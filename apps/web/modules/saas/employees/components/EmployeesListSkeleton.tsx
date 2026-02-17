"use client";

import { Skeleton } from "@ui/components/skeleton";

export function EmployeesListSkeleton() {
	return (
		<div>
			<div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton
						key={`stat-skeleton-${i}`}
						className="h-24 rounded-lg"
					/>
				))}
			</div>
			<div className="mb-4 flex items-center gap-4">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-10 w-32" />
				<Skeleton className="ml-auto h-10 w-32" />
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

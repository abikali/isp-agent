"use client";

import { Skeleton } from "@ui/components/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-2">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>

			{/* Customer Stats Row */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-28 rounded-xl" />
				))}
			</div>

			{/* Infrastructure Stats Row */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-28 rounded-xl" />
				))}
			</div>

			{/* Quick Actions */}
			<div className="space-y-3">
				<Skeleton className="h-5 w-24" />
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton key={i} className="h-28 rounded-xl" />
					))}
				</div>
			</div>
		</div>
	);
}

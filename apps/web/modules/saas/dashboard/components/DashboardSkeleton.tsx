"use client";

import { StatCardGroup, StatCardSkeleton } from "@shared/components/StatCard";
import { Skeleton } from "@ui/components/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-2">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>

			{/* Primary Stats */}
			<StatCardGroup columns={4}>
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</StatCardGroup>

			{/* Secondary Stats */}
			<StatCardGroup columns={4}>
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</StatCardGroup>

			{/* Infrastructure + Plan Distribution */}
			<div className="grid gap-4 lg:grid-cols-3">
				<Skeleton className="h-48 rounded-xl shadow-card" />
				<Skeleton className="h-48 rounded-xl shadow-card lg:col-span-2" />
			</div>

			{/* Quick Actions */}
			<div className="space-y-3">
				<Skeleton className="h-5 w-24" />
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton
							key={`action-${i}`}
							className="h-20 rounded-xl shadow-card"
						/>
					))}
				</div>
			</div>
		</div>
	);
}

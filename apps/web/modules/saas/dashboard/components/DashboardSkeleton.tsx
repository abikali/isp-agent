"use client";

import { MetricCardSkeleton, MetricStrip } from "@shared/components/MetricCard";
import { Skeleton } from "@ui/components/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>

			<MetricStrip columns={8}>
				{Array.from({ length: 8 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>

			<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-44 rounded-lg" />
				))}
			</div>

			<div className="space-y-2">
				<Skeleton className="h-3 w-24" />
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton
							key={`action-${i}`}
							className="h-[62px] rounded-lg"
						/>
					))}
				</div>
			</div>

			<div className="grid gap-3 lg:grid-cols-3">
				<Skeleton className="h-72 rounded-lg lg:col-span-2" />
				<Skeleton className="h-72 rounded-lg" />
			</div>
		</div>
	);
}

"use client";

import { MetricCardSkeleton, MetricStrip } from "@shared/components/MetricCard";
import { Skeleton } from "@ui/components/skeleton";

export function EmployeeStatsSkeleton() {
	return (
		<div className="space-y-4">
			<MetricStrip columns={5}>
				{Array.from({ length: 5 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>
			<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-44 rounded-lg" />
				))}
			</div>
		</div>
	);
}

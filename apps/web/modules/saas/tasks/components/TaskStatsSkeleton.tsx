"use client";

import { MetricCardSkeleton, MetricStrip } from "@shared/components/MetricCard";

export function TaskStatsSkeleton() {
	return (
		<MetricStrip columns={6}>
			{Array.from({ length: 6 }).map((_, i) => (
				<MetricCardSkeleton key={i} />
			))}
		</MetricStrip>
	);
}

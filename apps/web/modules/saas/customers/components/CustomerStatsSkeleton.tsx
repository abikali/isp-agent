"use client";

import { MetricCardSkeleton, MetricStrip } from "@shared/components/MetricCard";

export function CustomerStatsSkeleton() {
	return (
		<MetricStrip columns={8}>
			{Array.from({ length: 8 }).map((_, i) => (
				<MetricCardSkeleton key={i} />
			))}
		</MetricStrip>
	);
}

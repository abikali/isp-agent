"use client";

import { MetricCardSkeleton, MetricStrip } from "@shared/components/MetricCard";

export function DealerStatsSkeleton() {
	return (
		<MetricStrip columns={4}>
			{Array.from({ length: 4 }).map((_, i) => (
				<MetricCardSkeleton key={i} />
			))}
		</MetricStrip>
	);
}

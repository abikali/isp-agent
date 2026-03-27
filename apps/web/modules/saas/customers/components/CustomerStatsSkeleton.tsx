"use client";

import { StatCardGroup, StatCardSkeleton } from "@shared/components/StatCard";

export function CustomerStatsSkeleton() {
	return (
		<StatCardGroup columns={4}>
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
		</StatCardGroup>
	);
}

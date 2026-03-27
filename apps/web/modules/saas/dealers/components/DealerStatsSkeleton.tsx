"use client";

import { StatCardGroup, StatCardSkeleton } from "@shared/components/StatCard";

export function DealerStatsSkeleton() {
	return (
		<StatCardGroup columns={3}>
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
		</StatCardGroup>
	);
}

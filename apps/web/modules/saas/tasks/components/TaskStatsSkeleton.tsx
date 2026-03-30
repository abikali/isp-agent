"use client";

import { StatCardGroup, StatCardSkeleton } from "@shared/components/StatCard";

export function TaskStatsSkeleton() {
	return (
		<StatCardGroup columns={5}>
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
		</StatCardGroup>
	);
}

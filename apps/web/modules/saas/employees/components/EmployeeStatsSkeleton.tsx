"use client";

import { StatCardGroup, StatCardSkeleton } from "@shared/components/StatCard";

export function EmployeeStatsSkeleton() {
	return (
		<StatCardGroup columns={4}>
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
			<StatCardSkeleton />
		</StatCardGroup>
	);
}

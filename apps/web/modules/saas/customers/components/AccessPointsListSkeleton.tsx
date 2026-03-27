"use client";

import { Skeleton } from "@ui/components/skeleton";

export function AccessPointsListSkeleton() {
	return (
		<div>
			<div className="mb-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="mt-2 h-5 w-64" />
			</div>
			<Skeleton className="mb-4 h-10 w-80" />
			<Skeleton className="h-96 rounded-lg" />
		</div>
	);
}

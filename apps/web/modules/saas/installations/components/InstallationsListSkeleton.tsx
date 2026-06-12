"use client";

import { Skeleton } from "@ui/components/skeleton";

export function InstallationsListSkeleton() {
	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<Skeleton className="h-8 w-44" />
				<Skeleton className="h-10 w-52" />
			</div>
			<Skeleton className="h-96 rounded-lg" />
		</div>
	);
}

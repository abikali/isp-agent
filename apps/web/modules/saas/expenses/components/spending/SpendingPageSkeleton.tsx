import { PageShell } from "@shared/components/PageShell";
import { Skeleton } from "@ui/components/skeleton";

export function SpendingPageSkeleton() {
	return (
		<PageShell title="Spending" description="Loading the month…">
			<div className="grid gap-4 md:grid-cols-3">
				<Skeleton className="h-32 rounded-xl" />
				<Skeleton className="h-32 rounded-xl" />
				<Skeleton className="h-32 rounded-xl" />
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
			</div>
			<Skeleton className="h-96 rounded-lg" />
		</PageShell>
	);
}

export function BucketDetailSkeleton() {
	return (
		<PageShell title="Bucket" description="Loading…">
			<div className="grid gap-4 md:grid-cols-2">
				<Skeleton className="h-40 rounded-xl" />
				<Skeleton className="h-40 rounded-xl" />
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				<Skeleton className="h-96 rounded-lg lg:col-span-2" />
				<Skeleton className="h-96 rounded-lg" />
			</div>
		</PageShell>
	);
}

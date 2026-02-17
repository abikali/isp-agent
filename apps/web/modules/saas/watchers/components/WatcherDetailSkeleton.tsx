import { Skeleton } from "@ui/components/skeleton";

export function WatcherDetailSkeleton() {
	return (
		<div>
			<Skeleton className="mb-2 h-8 w-1/3" />
			<Skeleton className="mb-6 h-4 w-1/2" />
			<div className="grid gap-4 sm:grid-cols-2">
				<Skeleton className="h-32 rounded-lg" />
				<Skeleton className="h-32 rounded-lg" />
			</div>
			<Skeleton className="mt-6 h-64 rounded-lg" />
		</div>
	);
}

import { Skeleton } from "@ui/components/skeleton";

export function WatchersListSkeleton() {
	return (
		<div>
			<div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={`stat-${i}`} className="h-24 rounded-lg" />
				))}
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={`card-${i}`}
						className="rounded-lg border border-border p-6"
					>
						<Skeleton className="mb-2 h-5 w-2/3" />
						<Skeleton className="mb-4 h-4 w-full" />
						<div className="flex gap-2">
							<Skeleton className="h-6 w-16" />
							<Skeleton className="h-6 w-20" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

import { Skeleton } from "@ui/components/skeleton";

export function AgentStatsSkeleton() {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						key={`stat-skeleton-${i}`}
						className="rounded-lg border border-border p-4"
					>
						<Skeleton className="mb-2 h-4 w-24" />
						<Skeleton className="h-8 w-16" />
					</div>
				))}
			</div>
		</div>
	);
}

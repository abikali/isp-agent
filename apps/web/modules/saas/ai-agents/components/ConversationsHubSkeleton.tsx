"use client";

import { Skeleton } from "@ui/components/skeleton";

export function ConversationsHubSkeleton() {
	return (
		<div className="flex h-[calc(100vh-200px)] gap-0 overflow-hidden rounded-lg border border-border">
			{/* List panel skeleton */}
			<div className="w-full border-r border-border md:w-[350px]">
				<div className="border-b p-3">
					<Skeleton className="h-9 w-full rounded-md" />
				</div>
				<div className="space-y-1 p-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={`skeleton-${i}`}
							className="flex items-center gap-3 rounded-lg p-3"
						>
							<Skeleton className="size-10 shrink-0 rounded-full" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-48" />
							</div>
							<Skeleton className="h-3 w-12" />
						</div>
					))}
				</div>
			</div>
			{/* Detail panel skeleton */}
			<div className="hidden flex-1 md:block">
				<div className="flex h-full items-center justify-center">
					<Skeleton className="h-5 w-48" />
				</div>
			</div>
		</div>
	);
}

import { Skeleton } from "@ui/components/skeleton";

export function ConversationThreadSkeleton() {
	return (
		<div className="space-y-4 p-4">
			<div className="flex items-center gap-3 border-b pb-4">
				<Skeleton className="h-10 w-10 rounded-full" />
				<div>
					<Skeleton className="mb-1 h-4 w-32" />
					<Skeleton className="h-3 w-20" />
				</div>
			</div>
			<div className="space-y-3">
				{Array.from({ length: 5 }).map((_, i) => (
					<div
						key={`msg-skeleton-${i}`}
						className={
							i % 2 === 0
								? "flex justify-start"
								: "flex justify-end"
						}
					>
						<Skeleton
							className={`h-12 rounded-lg ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

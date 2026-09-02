import { PageShell } from "@shared/components/PageShell";
import { Skeleton } from "@ui/components/skeleton";

export function DealerDetailSkeleton() {
	return (
		<PageShell title="Dealer" description="Loading the ledger…">
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

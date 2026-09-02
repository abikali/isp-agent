import { PageShell } from "@shared/components/PageShell";
import { Skeleton } from "@ui/components/skeleton";

export function DealerFinancePageSkeleton() {
	return (
		<PageShell title="Dealers" description="Loading dealer balances…">
			<div className="grid gap-4 md:grid-cols-3">
				<Skeleton className="h-32 rounded-xl" />
				<Skeleton className="h-32 rounded-xl" />
				<Skeleton className="h-32 rounded-xl" />
			</div>
			<Skeleton className="h-96 rounded-lg" />
		</PageShell>
	);
}

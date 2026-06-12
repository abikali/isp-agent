"use client";

import { formatCurrency } from "@shared/lib/format";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { BoxesIcon } from "lucide-react";
import { useMyStockQuery } from "../hooks/use-worker";

export function WorkerStockPage() {
	const { allocations, totalValue, isLoading } = useMyStockQuery();

	if (isLoading) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton
						key={`stock-skel-${i}`}
						className="h-16 rounded-lg"
					/>
				))}
			</div>
		);
	}

	if (allocations.length === 0) {
		return (
			<div className="py-16 text-center">
				<BoxesIcon className="mx-auto size-10 text-muted-foreground/50" />
				<p className="mt-3 text-sm text-muted-foreground">
					You don't hold any stock right now.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{allocations.map((alloc) => (
				<Card key={alloc.id}>
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-sm font-medium">
								{alloc.stockItem.name}
							</p>
							<p className="text-xs text-muted-foreground">
								{formatCurrency(alloc.unitPrice)} each
							</p>
						</div>
						<span className="rounded-md bg-muted px-2.5 py-1 font-mono text-sm font-medium tabular-nums">
							× {alloc.quantity}
						</span>
					</CardContent>
				</Card>
			))}
			<div className="flex items-center justify-between px-1 pt-2 text-sm">
				<span className="text-muted-foreground">Total value</span>
				<span className="font-mono font-medium tabular-nums">
					{formatCurrency(totalValue)}
				</span>
			</div>
		</div>
	);
}

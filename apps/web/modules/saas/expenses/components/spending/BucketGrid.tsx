"use client";

import { formatCurrency } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import { ArrowRightIcon } from "lucide-react";
import type { SpendingBucketRow } from "../../hooks/use-spending";

interface BucketGridProps {
	buckets: SpendingBucketRow[];
	periodLabel: string;
	slug: string;
}

/**
 * Where the month's money went, one card per bucket, each a link to that
 * bucket's page. Empty buckets stay visible so the owner sees the shape of
 * his map, not just the lines that happened to land.
 */
export function BucketGrid({ buckets, periodLabel, slug }: BucketGridProps) {
	const max = Math.max(...buckets.map((b) => b.amount), 1);
	const visible = buckets.filter(
		(b) => b.id !== "none" || b.amount > 0 || b.previous > 0,
	);

	return (
		<section>
			<div className="mb-2 flex items-baseline justify-between">
				<h2 className="text-sm font-medium">
					Where it went {periodLabel.toLowerCase()}
				</h2>
				<span className="text-xs text-muted-foreground">
					Open a bucket for its month-by-month story.
				</span>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{visible.map((bucket) => {
					const delta = bucket.amount - bucket.previous;
					const none = bucket.id === "none";
					return (
						<Link
							key={bucket.id}
							to="/app/$organizationSlug/expenses/$bucketId"
							params={{
								organizationSlug: slug,
								bucketId: bucket.id,
							}}
							className={cn(
								"group rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20",
								none && "border-warning/40 bg-warning/[0.04]",
								bucket.kind === "DRAW" && "border-dashed",
							)}
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="truncate text-sm font-medium">
										{bucket.label}
									</div>
									<div className="mt-1 text-2xl font-medium tabular-nums leading-none tracking-tight">
										{formatCurrency(bucket.amount)}
									</div>
								</div>
								<ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
							</div>
							<div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className={cn(
										"h-full rounded-full",
										none ? "bg-warning" : "bg-chart-3/80",
									)}
									style={{
										width: `${Math.max((bucket.amount / max) * 100, bucket.amount > 0 ? 3 : 0)}%`,
									}}
								/>
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								{bucket.count === 0
									? bucket.previous > 0
										? `Nothing yet. ${formatCurrency(bucket.previous)} last month.`
										: "Nothing this month."
									: bucket.previous > 0
										? `${bucket.count} ${bucket.count === 1 ? "line" : "lines"} · ${delta >= 0 ? "up" : "down"} ${formatCurrency(Math.abs(delta))} on last month`
										: `${bucket.count} ${bucket.count === 1 ? "line" : "lines"} · nothing last month`}
							</p>
						</Link>
					);
				})}
			</div>
		</section>
	);
}

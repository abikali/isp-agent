"use client";

import { formatCurrency } from "@shared/lib/format";
import { Card, CardContent } from "@ui/components/card";
import { Progress } from "@ui/components/progress";
import { Skeleton } from "@ui/components/skeleton";
import { ChevronRightIcon, HandCoinsIcon } from "lucide-react";
import { useCollectors } from "../hooks/use-billing";

function getInitials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase();
}

export function CollectorPickerPage({ basePath }: { basePath: string }) {
	const { data: collectorsData, isLoading } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-2xl font-bold tracking-tight">
					Cash Collection
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Pick a collector to manage their cash
				</p>
			</div>

			{isLoading ? (
				<div className="divide-y divide-border rounded-lg border">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-14" />
					))}
				</div>
			) : collectors.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-16 text-center">
						<HandCoinsIcon className="size-12 text-muted-foreground/30" />
						<p className="text-lg font-medium">
							No collectors found
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="divide-y divide-border rounded-lg border bg-card">
					{collectors.map((c) => {
						const progress =
							c.monthTotal > 0
								? Math.round(
										(c.monthCollected / c.monthTotal) * 100,
									)
								: 0;
						const hasBalance = c.inHand > 0;

						return (
							<a
								key={c.id}
								href={`${basePath}/${c.username ?? c.id}`}
								className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-4"
							>
								{/* Avatar */}
								<div className="size-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
									{getInitials(c.name)}
								</div>

								{/* Name + meta */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="truncate text-sm font-semibold">
											{c.name}
										</span>
										{c.username && (
											<span className="hidden truncate text-xs text-muted-foreground sm:inline">
												@{c.username}
											</span>
										)}
									</div>
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<span>{c.customerCount} customers</span>
										{c.stoppedCount > 0 && (
											<span className="text-red-500 dark:text-red-400">
												· {c.stoppedCount} stopped
											</span>
										)}
									</div>
								</div>

								{/* In hand */}
								<div className="hidden shrink-0 text-right sm:block">
									<p className="text-[10px] uppercase tracking-wide text-muted-foreground">
										In hand
									</p>
									<p
										className={`text-sm font-semibold tabular-nums leading-tight ${hasBalance ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}
									>
										{formatCurrency(c.inHand)}
									</p>
								</div>

								{/* Collected progress */}
								<div className="hidden w-40 shrink-0 md:block">
									<div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
										<span>Collected</span>
										<span className="font-medium tabular-nums text-foreground">
											{progress}%
										</span>
									</div>
									<Progress
										value={progress}
										className="h-1.5 mt-1"
									/>
									<p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
										{c.monthCollected} / {c.monthTotal}
									</p>
								</div>

								{/* Mobile: compact in-hand inline */}
								<div className="flex shrink-0 flex-col items-end text-right sm:hidden">
									<span
										className={`text-sm font-semibold tabular-nums ${hasBalance ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}
									>
										{formatCurrency(c.inHand)}
									</span>
									<span className="text-[10px] tabular-nums text-muted-foreground">
										{progress}% collected
									</span>
								</div>

								<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
							</a>
						);
					})}
				</div>
			)}
		</div>
	);
}

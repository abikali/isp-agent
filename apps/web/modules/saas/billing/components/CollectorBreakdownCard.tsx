"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { formatCurrency } from "@shared/lib/format";
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { cn } from "@ui/lib";
import { ChevronRightIcon, HandCoinsIcon, UsersIcon } from "lucide-react";

export interface CollectorBreakdownEntry {
	collectorId: string;
	username: string | null;
	name: string;
	paymentCount: number;
	totalCollected: number;
	totalHandedOff: number;
	balance: number;
}

interface CollectorBreakdownCardProps {
	entries: CollectorBreakdownEntry[];
	basePath: string;
	/** Limit visible rows; remainder rolls into the "View all" link. */
	limit?: number;
	className?: string;
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase();
}

function slugFor(c: { username: string | null; collectorId: string }): string {
	return c.username ?? c.collectorId;
}

export function CollectorBreakdownCard({
	entries,
	basePath,
	limit = 6,
	className,
}: CollectorBreakdownCardProps) {
	const maxCollected = Math.max(...entries.map((e) => e.totalCollected), 0);
	const visible = entries.slice(0, limit);
	const overflow = Math.max(0, entries.length - limit);

	return (
		<ContentCard className={cn("flex flex-col", className)}>
			<ContentCardSection className="flex items-center justify-between border-b border-border">
				<div>
					<div className="text-sm font-medium">
						Collector breakdown
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Per-collector cash position this cycle
					</p>
				</div>
				<a
					href={`${basePath}/collectors`}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					View all →
				</a>
			</ContentCardSection>

			{entries.length === 0 ? (
				<div className="p-4 md:p-5">
					<EmptyState
						icon={UsersIcon}
						title="No collector activity"
						description="No payments recorded by collectors in this cycle yet."
					/>
				</div>
			) : (
				<ul className="divide-y divide-border">
					{visible.map((e) => {
						const pct =
							maxCollected > 0
								? (e.totalCollected / maxCollected) * 100
								: 0;
						const hasBalance = e.balance > 0;
						return (
							<li key={e.collectorId}>
								<a
									href={`${basePath}/collectors/${slugFor(e)}`}
									className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
								>
									{/* Subtle bar showing relative contribution */}
									<span
										aria-hidden
										className="pointer-events-none absolute inset-y-0 left-0 -z-10 bg-gradient-to-r from-success/[0.08] via-success/[0.04] to-transparent"
										style={{ width: `${pct}%` }}
									/>
									<Avatar className="size-7 shrink-0">
										<AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
											{getInitials(e.name)}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline gap-1.5">
											<span className="truncate text-sm font-medium leading-tight group-hover:text-primary">
												{e.name}
											</span>
											<span className="hidden text-[11px] text-muted-foreground sm:inline">
												{e.paymentCount}{" "}
												{e.paymentCount === 1
													? "payment"
													: "payments"}
											</span>
										</div>
									</div>
									<div className="hidden items-center gap-3 text-right sm:flex">
										<div>
											<div className="text-xs font-medium tabular-nums leading-tight">
												{formatCurrency(
													e.totalCollected,
												)}
											</div>
											<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
												Collected
											</div>
										</div>
										<div>
											<div className="text-xs tabular-nums leading-tight text-muted-foreground">
												{formatCurrency(
													e.totalHandedOff,
												)}
											</div>
											<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
												Handed off
											</div>
										</div>
										<div>
											<div
												className={cn(
													"flex items-center justify-end gap-1 text-xs font-medium tabular-nums leading-tight",
													hasBalance
														? "text-warning"
														: "text-muted-foreground/60",
												)}
											>
												{hasBalance && (
													<HandCoinsIcon className="size-3" />
												)}
												{formatCurrency(e.balance)}
											</div>
											<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
												In hand
											</div>
										</div>
									</div>
									{/* Mobile compact view */}
									<div className="text-right sm:hidden">
										<div className="text-xs font-medium tabular-nums leading-tight">
											{formatCurrency(e.totalCollected)}
										</div>
										<div
											className={cn(
												"text-[11px] tabular-nums leading-tight",
												hasBalance
													? "text-warning"
													: "text-muted-foreground/60",
											)}
										>
											{formatCurrency(e.balance)} in hand
										</div>
									</div>
									<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
								</a>
							</li>
						);
					})}
					{overflow > 0 && (
						<li>
							<a
								href={`${basePath}/collectors`}
								className="block px-4 py-2 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
							>
								+ {overflow} more
							</a>
						</li>
					)}
				</ul>
			)}
		</ContentCard>
	);
}

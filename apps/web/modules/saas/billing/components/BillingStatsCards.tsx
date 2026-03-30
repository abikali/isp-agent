"use client";

import { formatCurrency } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { BanknoteIcon, UsersIcon, WalletIcon } from "lucide-react";

interface BillingStatsCardsProps {
	stats: {
		paidCustomers: number;
		totalCustomers: number;
		netBalance: number;
		dailyCollected: number;
		dailyCount: number;
	} | null;
	isLoading: boolean;
	/** Compact mobile-friendly layout with horizontal scroll */
	compact?: boolean;
}

export function BillingStatsCards({
	stats,
	isLoading,
	compact,
}: BillingStatsCardsProps) {
	if (isLoading || !stats) {
		return (
			<div
				className={
					compact
						? "flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
						: "grid gap-3 grid-cols-3 mb-4"
				}
			>
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton
						key={i}
						className={
							compact ? "h-24 min-w-[140px] flex-1" : "h-20"
						}
					/>
				))}
			</div>
		);
	}

	const containerClass = compact
		? "flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x"
		: "grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4";

	const cardBase = compact ? "min-w-[140px] flex-1 snap-start" : "";
	const padding = compact ? "p-3" : "p-4";
	const labelClass = compact
		? "flex items-center gap-1.5 text-xs text-muted-foreground"
		: "flex items-center gap-2 text-sm text-muted-foreground mb-1";
	const iconClass = compact ? "size-3.5" : "h-4 w-4";

	return (
		<div className={containerClass}>
			<Card
				className={`${cardBase} border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30`}
			>
				<CardContent className={padding}>
					<div className={labelClass}>
						<UsersIcon className={iconClass} />
						{compact ? "Bills" : "Collected Bills"}
					</div>
					<p className="mt-1 text-2xl font-bold">
						{stats.paidCustomers}
						<span className="text-sm font-normal text-muted-foreground">
							/{stats.totalCustomers}
						</span>
					</p>
				</CardContent>
			</Card>
			<Card
				className={`${cardBase} border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30`}
			>
				<CardContent className={padding}>
					<div className={labelClass}>
						<WalletIcon className={iconClass} />
						In Hand
					</div>
					<p className="mt-1 text-2xl font-bold">
						{formatCurrency(stats.netBalance)}
					</p>
				</CardContent>
			</Card>
			<Card
				className={`${cardBase} border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30`}
			>
				<CardContent className={padding}>
					<div className={labelClass}>
						<BanknoteIcon className={iconClass} />
						Today
					</div>
					<p className="mt-1 text-2xl font-bold">
						{formatCurrency(stats.dailyCollected)}
					</p>
					{stats.dailyCount > 0 && (
						<Badge
							variant="secondary"
							className={
								compact ? "text-xs mt-0.5" : "ml-2 text-xs"
							}
						>
							{stats.dailyCount} bills
						</Badge>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

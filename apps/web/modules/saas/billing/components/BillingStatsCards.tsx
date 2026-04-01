"use client";

import {
	StatCard,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import { formatCurrency } from "@shared/lib/format";
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
}

export function BillingStatsCards({
	stats,
	isLoading,
}: BillingStatsCardsProps) {
	if (isLoading || !stats) {
		return (
			<StatCardGroup columns={3}>
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</StatCardGroup>
		);
	}

	return (
		<StatCardGroup columns={3}>
			<StatCard
				title="Collected Bills"
				value={`${stats.paidCustomers}/${stats.totalCustomers}`}
				icon={UsersIcon}
				color="blue"
			/>
			<StatCard
				title="In Hand"
				value={formatCurrency(stats.netBalance)}
				icon={WalletIcon}
				color="emerald"
			/>
			<StatCard
				title="Today"
				value={formatCurrency(stats.dailyCollected)}
				icon={BanknoteIcon}
				color="amber"
				description={
					stats.dailyCount > 0
						? `${stats.dailyCount} bills`
						: undefined
				}
			/>
		</StatCardGroup>
	);
}

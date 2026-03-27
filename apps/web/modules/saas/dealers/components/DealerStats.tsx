"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { UserCheckIcon, UserMinusIcon, UsersIcon } from "lucide-react";
import { useDealerStats } from "../hooks/use-dealers";

export function DealerStats() {
	const stats = useDealerStats();

	return (
		<StatCardGroup columns={3}>
			<StatCard
				title="Total Dealers"
				value={stats.total}
				icon={UsersIcon}
			/>
			<StatCard
				title="Active"
				value={stats.active}
				icon={UserCheckIcon}
				variant="success"
			/>
			<StatCard
				title="Inactive"
				value={stats.inactive}
				icon={UserMinusIcon}
			/>
		</StatCardGroup>
	);
}

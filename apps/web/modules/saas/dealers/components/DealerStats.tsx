"use client";

import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import {
	PercentIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useDealerStats } from "../hooks/use-dealers";

export function DealerStats() {
	const stats = useDealerStats();
	const activeRate =
		stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

	return (
		<MetricStrip columns={4}>
			<MetricCard
				label="Total"
				value={stats.total}
				icon={UsersIcon}
				tone="info"
			/>
			<MetricCard
				label="Active"
				value={stats.active}
				icon={UserCheckIcon}
				tone="success"
			/>
			<MetricCard
				label="Inactive"
				value={stats.inactive}
				icon={UserMinusIcon}
				tone={stats.inactive > 0 ? "warning" : "default"}
			/>
			<MetricCard
				label="Active rate"
				value={`${activeRate}%`}
				icon={PercentIcon}
				tone={activeRate >= 70 ? "success" : "warning"}
			/>
		</MetricStrip>
	);
}

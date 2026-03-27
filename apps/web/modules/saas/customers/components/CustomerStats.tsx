"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { formatCurrency } from "@shared/lib/format";
import {
	DollarSignIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useCustomerStats } from "../hooks/use-customers";

export function CustomerStats() {
	const stats = useCustomerStats();

	return (
		<StatCardGroup columns={4}>
			<StatCard
				title="Total Customers"
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
				title="Inactive / Suspended"
				value={stats.inactive + stats.suspended}
				icon={UserMinusIcon}
				variant={
					stats.inactive + stats.suspended > 0 ? "warning" : "default"
				}
			/>
			<StatCard
				title="Monthly Revenue"
				value={formatCurrency(stats.totalMonthlyRevenue)}
				icon={DollarSignIcon}
			/>
		</StatCardGroup>
	);
}

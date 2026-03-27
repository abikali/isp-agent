"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import {
	ClockIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useEmployeeStats } from "../hooks/use-employees";

export function EmployeeStats() {
	const stats = useEmployeeStats();

	return (
		<StatCardGroup columns={4}>
			<StatCard
				title="Total Employees"
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
				title="On Leave"
				value={stats.onLeave}
				icon={ClockIcon}
				variant="warning"
			/>
			<StatCard
				title="Inactive"
				value={stats.inactive}
				icon={UserMinusIcon}
			/>
		</StatCardGroup>
	);
}

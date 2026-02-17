"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import {
	ClockIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useEmployeeStats } from "../hooks/use-employees";

export function EmployeeStats() {
	const stats = useEmployeeStats();

	const cards = [
		{
			title: "Total Employees",
			value: stats.total,
			icon: UsersIcon,
		},
		{
			title: "Active",
			value: stats.active,
			icon: UserCheckIcon,
		},
		{
			title: "On Leave",
			value: stats.onLeave,
			icon: ClockIcon,
		},
		{
			title: "Inactive",
			value: stats.inactive,
			icon: UserMinusIcon,
		},
	];

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{cards.map((card) => (
				<Card key={card.title}>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							{card.title}
						</CardTitle>
						<card.icon className="size-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{card.value}</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

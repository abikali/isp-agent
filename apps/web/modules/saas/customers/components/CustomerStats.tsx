"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import {
	DollarSignIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useCustomerStats } from "../hooks/use-customers";

export function CustomerStats() {
	const stats = useCustomerStats();

	const cards = [
		{
			title: "Total Customers",
			value: stats.total,
			icon: UsersIcon,
		},
		{
			title: "Active",
			value: stats.active,
			icon: UserCheckIcon,
		},
		{
			title: "Inactive / Suspended",
			value: stats.inactive + stats.suspended,
			icon: UserMinusIcon,
		},
		{
			title: "Monthly Revenue",
			value: `$${stats.totalMonthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
			icon: DollarSignIcon,
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

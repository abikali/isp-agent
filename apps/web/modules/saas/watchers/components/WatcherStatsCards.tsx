"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import {
	ActivityIcon,
	AlertTriangleIcon,
	CheckCircleIcon,
	HelpCircleIcon,
} from "lucide-react";
import { useWatcherStats } from "../hooks/use-executions";

export function WatcherStatsCards() {
	const stats = useWatcherStats();

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Total</CardTitle>
					<ActivityIcon className="size-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">{stats.total}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Up</CardTitle>
					<CheckCircleIcon className="size-4 text-green-500" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold text-green-600">
						{stats.up}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Down</CardTitle>
					<AlertTriangleIcon className="size-4 text-red-500" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold text-red-600">
						{stats.down}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">
						Unknown
					</CardTitle>
					<HelpCircleIcon className="size-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold text-muted-foreground">
						{stats.unknown}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

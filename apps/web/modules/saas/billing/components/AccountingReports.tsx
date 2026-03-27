"use client";

import { formatCurrency } from "@shared/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import {
	DollarSignIcon,
	ReceiptIcon,
	TrendingUpIcon,
	UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { useAccountingReports } from "../hooks/use-billing";

export function AccountingReportsSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<div className="grid gap-4 md:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-28" />
				))}
			</div>
			<Skeleton className="h-64" />
		</div>
	);
}

export function AccountingReports() {
	const [scope, setScope] = useState<"month" | "all">("month");
	const { data } = useAccountingReports(scope);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Accounting Reports
					</h2>
					<p className="text-muted-foreground">
						Financial summary across collectors and expenses
					</p>
				</div>
				<Tabs
					value={scope}
					onValueChange={(v) => setScope(v as "month" | "all")}
				>
					<TabsList>
						<TabsTrigger value="month">This Month</TabsTrigger>
						<TabsTrigger value="all">All Time</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Total Collected
						</CardTitle>
						<DollarSignIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							{formatCurrency(data.totalCollected)}
						</p>
						<p className="text-xs text-muted-foreground">
							From all collectors
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Total Handed Off
						</CardTitle>
						<UsersIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							{formatCurrency(data.totalHandedOff)}
						</p>
						<p className="text-xs text-muted-foreground">
							Cash received from collectors
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Expenses
						</CardTitle>
						<ReceiptIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-destructive">
							{formatCurrency(data.totalExpenses)}
						</p>
						<p className="text-xs text-muted-foreground">
							Approved expenses
						</p>
					</CardContent>
				</Card>

				<Card className="border-primary/20 bg-primary/5">
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">
							Grand Total
						</CardTitle>
						<TrendingUpIcon className="h-4 w-4 text-primary" />
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-primary">
							{formatCurrency(data.grandTotal)}
						</p>
						<p className="text-xs text-muted-foreground">
							Handed off − Expenses
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Collector Breakdown Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Collector Breakdown
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Collector</TableHead>
								<TableHead className="text-right">
									Payments
								</TableHead>
								<TableHead className="text-right">
									Total Collected
								</TableHead>
								<TableHead className="text-right">
									Handed Off
								</TableHead>
								<TableHead className="text-right">
									Balance
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.collectorBreakdown.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={5}
										className="text-center text-muted-foreground py-8"
									>
										No data for selected period
									</TableCell>
								</TableRow>
							) : (
								data.collectorBreakdown.map((c) => (
									<TableRow key={c.collectorId}>
										<TableCell className="font-medium">
											{c.name}
										</TableCell>
										<TableCell className="text-right">
											{c.paymentCount}
										</TableCell>
										<TableCell className="text-right">
											{formatCurrency(c.totalCollected)}
										</TableCell>
										<TableCell className="text-right">
											{formatCurrency(c.totalHandedOff)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatCurrency(c.balance)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

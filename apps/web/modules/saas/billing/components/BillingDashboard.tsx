"use client";

import {
	StatCard,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import { formatCurrency } from "@shared/lib/format";
import {
	BanknoteIcon,
	CheckCircleIcon,
	ClockIcon,
	DollarSignIcon,
	OctagonXIcon,
	PercentIcon,
	UsersIcon,
} from "lucide-react";
import { usePaymentStats } from "../hooks/use-billing";

export function BillingDashboard() {
	const stats = usePaymentStats();

	return (
		<div className="space-y-6">
			<StatCardGroup columns={4}>
				<StatCard
					title="Total Collected"
					value={formatCurrency(stats.totalCollected)}
					icon={DollarSignIcon}
					variant="success"
				/>
				<StatCard
					title="Paid"
					value={`${stats.paidPercentage}%`}
					icon={PercentIcon}
					description={`${stats.totalCustomers - stats.unpaidCustomers} of ${stats.totalCustomers} active customers`}
				/>
				<StatCard
					title="Unpaid"
					value={stats.unpaidCustomers}
					icon={UsersIcon}
					variant={stats.unpaidCustomers > 0 ? "warning" : "default"}
				/>
				<StatCard
					title="Stopped"
					value={stats.stoppedPayments}
					icon={OctagonXIcon}
					variant={
						stats.stoppedPayments > 0 ? "destructive" : "default"
					}
				/>
			</StatCardGroup>

			<StatCardGroup columns={4}>
				<StatCard
					title="Total Payments"
					value={stats.totalPayments}
					icon={BanknoteIcon}
				/>
				<StatCard
					title="Processed"
					value={stats.processedPayments}
					icon={CheckCircleIcon}
					variant="success"
				/>
				<StatCard
					title="Pending"
					value={stats.pendingPayments}
					icon={ClockIcon}
					variant={stats.pendingPayments > 0 ? "warning" : "default"}
				/>
				<StatCard
					title="Partial"
					value={stats.partialPayments}
					icon={BanknoteIcon}
				/>
			</StatCardGroup>

			{stats.collectorBreakdown.length > 0 && (
				<div className="rounded-xl bg-card p-5 shadow-card">
					<h3 className="mb-4 text-sm font-medium text-muted-foreground">
						Collection by Collector
					</h3>
					<div className="space-y-3">
						{stats.collectorBreakdown
							.sort((a, b) => b.totalCollected - a.totalCollected)
							.map((c) => (
								<div
									key={c.collectorId}
									className="flex items-center justify-between"
								>
									<div>
										<span className="text-sm font-medium">
											{c.collectorName}
										</span>
										<span className="ml-2 text-xs text-muted-foreground">
											({c.paymentCount} payments)
										</span>
									</div>
									<span className="text-sm font-semibold tabular-nums">
										${c.totalCollected.toLocaleString()}
									</span>
								</div>
							))}
					</div>
				</div>
			)}
		</div>
	);
}

export function BillingDashboardSkeleton() {
	return (
		<div className="space-y-6">
			<StatCardGroup columns={4}>
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</StatCardGroup>
			<StatCardGroup columns={4}>
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</StatCardGroup>
		</div>
	);
}

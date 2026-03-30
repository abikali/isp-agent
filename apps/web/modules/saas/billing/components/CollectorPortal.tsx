"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { SearchInput } from "@shared/components/SearchInput";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { CalendarXIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
	useCollectorStats,
	useCurrentMonth,
	useCustomerGroups,
	useUnpaidCustomers,
} from "../hooks/use-billing";
import { GroupSelect } from "./BillingFilters";
import { BillingStatsCards } from "./BillingStatsCards";
import { CustomerCard, type UnpaidCustomer } from "./CustomerCard";
import { PaymentSheet } from "./PaymentSheet";

const POLL_INTERVAL = 30_000;

function StatsStrip() {
	const { data: stats, isLoading } = useCollectorStats(
		undefined,
		POLL_INTERVAL,
	);

	return (
		<BillingStatsCards
			stats={stats ?? null}
			isLoading={isLoading}
			compact
		/>
	);
}

export function CollectorPortal() {
	const { employee } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [groupFilter, setGroupFilter] = useState<string>("");
	const [expiredOnly, setExpiredOnly] = useState(false);
	const [page, setPage] = useState(1);
	const [selectedCustomer, setSelectedCustomer] =
		useState<UnpaidCustomer | null>(null);
	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;
	const { groups } = useCustomerGroups();

	const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
	const { customers, total, totalPages } = useUnpaidCustomers({
		year: activeMonth?.year,
		month: activeMonth?.month,
		collectorId: employee?.id,
		search: debouncedSearch || undefined,
		groupName: groupFilter || undefined,
		excludeGroupName: groupFilter ? undefined : "free",
		expiryTo: expiredOnly ? today : undefined,
		page,
		pageSize: 50,
		refetchInterval: POLL_INTERVAL,
	});

	return (
		<div className="space-y-4 pb-8">
			{/* Stats */}
			<StatsStrip />

			{/* Filters */}
			<div className="space-y-2">
				<SearchInput
					value={search}
					onChange={(val) => {
						setSearch(val);
						setPage(1);
					}}
					placeholder="Search customers..."
				/>
				<div className="flex gap-2">
					<GroupSelect
						value={groupFilter}
						onChange={(val) => {
							setGroupFilter(val);
							setPage(1);
						}}
						groups={groups}
						excludeFree
						className="flex-1"
					/>
					<Button
						variant={expiredOnly ? "primary" : "outline"}
						size="md"
						className="shrink-0"
						onClick={() => {
							setExpiredOnly(!expiredOnly);
							setPage(1);
						}}
					>
						<CalendarXIcon className="mr-1.5 size-3.5" />
						Expired
					</Button>
				</div>
			</div>

			{/* Customer count */}
			<p className="text-sm text-muted-foreground">{total} customers</p>

			{/* Customer cards */}
			{customers.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12">
						<UsersIcon className="size-10 text-muted-foreground/40" />
						<p className="text-lg font-medium">All paid up!</p>
						<p className="text-sm text-muted-foreground">
							No unpaid customers found.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{customers.map((customer) => (
						<CustomerCard
							key={customer.id}
							customer={customer}
							onPay={setSelectedCustomer}
						/>
					))}
				</div>
			)}

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-3">
					<Button
						variant="outline"
						size="lg"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						className="flex-1 max-w-[150px]"
					>
						Previous
					</Button>
					<span className="text-sm text-muted-foreground tabular-nums">
						{page}/{totalPages}
					</span>
					<Button
						variant="outline"
						size="lg"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
						className="flex-1 max-w-[150px]"
					>
						Next
					</Button>
				</div>
			)}

			{/* Payment bottom sheet */}
			<PaymentSheet
				open={!!selectedCustomer}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedCustomer(null);
					}
				}}
				customer={selectedCustomer}
			/>
		</div>
	);
}

export function CollectorPortalSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex gap-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-24 flex-1" />
				))}
			</div>
			<Skeleton className="h-10 w-full" />
			<div className="flex gap-2">
				<Skeleton className="h-10 flex-1" />
				<Skeleton className="h-10 w-24" />
			</div>
			{Array.from({ length: 4 }).map((_, i) => (
				<Skeleton key={i} className="h-36 w-full" />
			))}
		</div>
	);
}

"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import {
	BanknoteIcon,
	CalendarXIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	useCollectorStats,
	useCurrentMonth,
	useCustomerGroups,
	useUnpaidCustomers,
} from "../hooks/use-billing";
import { CustomerCard, type UnpaidCustomer } from "./CustomerCard";
import { PaymentSheet } from "./PaymentSheet";

const POLL_INTERVAL = 30_000;

function StatsStrip() {
	const { data: stats, isLoading } = useCollectorStats(
		undefined,
		POLL_INTERVAL,
	);

	if (isLoading || !stats) {
		return (
			<div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-24 min-w-[140px] flex-1" />
				))}
			</div>
		);
	}

	return (
		<div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
			<Card className="min-w-[140px] flex-1 snap-start border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
				<CardContent className="p-3">
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<UsersIcon className="size-3.5" />
						Bills
					</div>
					<p className="mt-1 text-2xl font-bold">
						{stats.paidCustomers}
						<span className="text-sm font-normal text-muted-foreground">
							/{stats.totalCustomers}
						</span>
					</p>
				</CardContent>
			</Card>
			<Card className="min-w-[140px] flex-1 snap-start border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
				<CardContent className="p-3">
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<WalletIcon className="size-3.5" />
						In Hand
					</div>
					<p className="mt-1 text-2xl font-bold">
						{formatCurrency(stats.netBalance)}
					</p>
				</CardContent>
			</Card>
			<Card className="min-w-[140px] flex-1 snap-start border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
				<CardContent className="p-3">
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<BanknoteIcon className="size-3.5" />
						Today
					</div>
					<p className="mt-1 text-2xl font-bold">
						{formatCurrency(stats.dailyCollected)}
					</p>
					{stats.dailyCount > 0 && (
						<Badge variant="secondary" className="text-xs mt-0.5">
							{stats.dailyCount} bills
						</Badge>
					)}
				</CardContent>
			</Card>
		</div>
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
					<Select
						value={groupFilter}
						onValueChange={(val) => {
							setGroupFilter(val === "all" ? "" : val);
							setPage(1);
						}}
					>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder="All areas" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All areas</SelectItem>
							{groups
								.filter((g) => g.toLowerCase() !== "free")
								.map((g) => (
									<SelectItem key={g} value={g}>
										{g}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
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

"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { SearchInput } from "@shared/components/SearchInput";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { UsersIcon } from "lucide-react";
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

const POLL_INTERVAL = 10_000;

function StatsStrip() {
	const { data: stats, isLoading } = useCollectorStats(
		undefined,
		POLL_INTERVAL,
	);

	return <BillingStatsCards stats={stats ?? null} isLoading={isLoading} />;
}

export function CollectorPortal() {
	const { employee } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [groupFilter, setGroupFilter] = useState<string>("");
	const [dayFrom, setDayFrom] = useState<number | null>(null);
	const [dayTo, setDayTo] = useState<number | null>(null);
	const [page, setPage] = useState(1);
	const [selectedCustomer, setSelectedCustomer] =
		useState<UnpaidCustomer | null>(null);
	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;
	const { groups } = useCustomerGroups();

	// Build list of days in the active month
	const monthDays = useMemo(() => {
		if (!activeMonth) {
			return [];
		}
		const daysInMonth = new Date(
			activeMonth.year,
			activeMonth.month,
			0,
		).getDate();
		const days: { day: number; label: string; weekday: string }[] = [];
		for (let d = 1; d <= daysInMonth; d++) {
			const date = new Date(activeMonth.year, activeMonth.month - 1, d);
			days.push({
				day: d,
				label: String(d),
				weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
			});
		}
		return days;
	}, [activeMonth]);

	function handleDayTap(day: number) {
		if (dayFrom === null) {
			// First tap — set "from"
			setDayFrom(day);
			setDayTo(null);
		} else if (dayTo === null) {
			if (day === dayFrom) {
				// Tap same day — clear
				setDayFrom(null);
			} else if (day < dayFrom) {
				// Tap earlier day — new "from", old from becomes "to"
				setDayTo(dayFrom);
				setDayFrom(day);
			} else {
				// Tap later day — set "to"
				setDayTo(day);
			}
		} else {
			// Range already selected — start fresh
			setDayFrom(day);
			setDayTo(null);
		}
		setPage(1);
	}

	// Convert selected days to date strings
	function dayToDate(day: number | null) {
		if (!day || !activeMonth) {
			return undefined;
		}
		return `${activeMonth.year}-${String(activeMonth.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}

	const { customers, total, totalPages } = useUnpaidCustomers({
		year: activeMonth?.year,
		month: activeMonth?.month,
		collectorId: employee?.id,
		search: debouncedSearch || undefined,
		groupName: groupFilter || undefined,
		excludeGroupName: groupFilter ? undefined : "free",
		expiryFrom: dayToDate(dayFrom),
		expiryTo: dayToDate(dayTo ?? dayFrom),
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
				<div className="flex gap-2">
					<SearchInput
						value={search}
						onChange={(val) => {
							setSearch(val);
							setPage(1);
						}}
						placeholder="Search customers..."
						className="flex-1"
					/>
					<GroupSelect
						value={groupFilter}
						onChange={(val) => {
							setGroupFilter(val);
							setPage(1);
						}}
						groups={groups}
						excludeFree
						className="w-[140px]"
					/>
				</div>

				{/* Day picker — horizontal scroll, tap to select from/to range */}
				{monthDays.length > 0 && (
					<div className="-mx-4 px-4">
						<div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
							<button
								type="button"
								onClick={() => {
									setDayFrom(null);
									setDayTo(null);
									setPage(1);
								}}
								className={`flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
									dayFrom === null
										? "bg-primary text-primary-foreground"
										: "bg-muted/60 text-muted-foreground"
								}`}
							>
								<span className="text-[10px]">All</span>
								<span className="text-sm font-semibold">
									&bull;
								</span>
							</button>
							{monthDays.map(({ day, label, weekday }) => {
								const rangeStart = dayFrom ?? 0;
								const rangeEnd = dayTo ?? dayFrom ?? 0;
								const isEndpoint =
									day === dayFrom || day === dayTo;
								const isInRange =
									rangeStart > 0 &&
									day >= rangeStart &&
									day <= rangeEnd;

								let style = "bg-muted/60 text-muted-foreground";
								if (isEndpoint) {
									style =
										"bg-primary text-primary-foreground";
								} else if (isInRange) {
									style =
										"bg-primary/15 text-primary font-medium";
								}

								return (
									<button
										key={day}
										type="button"
										onClick={() => handleDayTap(day)}
										className={`flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-xs transition-colors ${style}`}
									>
										<span className="text-[10px]">
											{weekday}
										</span>
										<span className="text-sm font-semibold">
											{label}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}
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

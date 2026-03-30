"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import {
	BanknoteIcon,
	CalendarXIcon,
	DollarSignIcon,
	MessageCircleIcon,
	PhoneIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	useCollectorStats,
	useCollectors,
	useCurrentMonth,
	useCustomerGroups,
	useUnpaidCustomers,
} from "../hooks/use-billing";
import { calculateTotalDue, getExpiryInfo } from "../lib/billing-utils";
import { formatWhatsAppLink } from "../lib/whatsapp";
import { PaymentDialog } from "./PaymentDialog";

function CollectorStatsHeader() {
	const { data: stats, isLoading } = useCollectorStats();

	if (isLoading || !stats) {
		return (
			<div className="grid gap-3 grid-cols-3 mb-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-20" />
				))}
			</div>
		);
	}

	return (
		<div className="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4">
			<Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<UsersIcon className="h-4 w-4" />
						Collected Bills
					</div>
					<div className="text-2xl font-bold">
						{stats.paidCustomers}{" "}
						<span className="text-base font-normal text-muted-foreground">
							/ {stats.totalCustomers}
						</span>
					</div>
				</CardContent>
			</Card>
			<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<WalletIcon className="h-4 w-4" />
						In Hand
					</div>
					<div className="text-2xl font-bold">
						{formatCurrency(stats.netBalance)}
					</div>
				</CardContent>
			</Card>
			<Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<BanknoteIcon className="h-4 w-4" />
						Today
					</div>
					<div className="text-2xl font-bold">
						{formatCurrency(stats.dailyCollected)}
						{stats.dailyCount > 0 && (
							<Badge variant="secondary" className="ml-2 text-xs">
								{stats.dailyCount} bills
							</Badge>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function CollectionOverview({
	total,
	totalAmountDue,
	expiredCount,
	isLoading,
}: {
	total: number;
	totalAmountDue: number;
	expiredCount: number;
	isLoading: boolean;
}) {
	if (isLoading && total === 0) {
		return (
			<div className="grid gap-3 grid-cols-3 mb-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-20" />
				))}
			</div>
		);
	}

	const avgDue = total > 0 ? totalAmountDue / total : 0;

	return (
		<div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-4">
			<Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<UsersIcon className="h-4 w-4" />
						Unpaid
					</div>
					<div className="text-2xl font-bold tabular-nums">
						{total}
					</div>
				</CardContent>
			</Card>
			<Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<DollarSignIcon className="h-4 w-4" />
						To Collect
					</div>
					<div className="text-2xl font-bold tabular-nums">
						{formatCurrency(totalAmountDue)}
					</div>
				</CardContent>
			</Card>
			<Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<CalendarXIcon className="h-4 w-4" />
						Expired
					</div>
					<div className="text-2xl font-bold tabular-nums">
						{expiredCount}
						{total > 0 && (
							<span className="text-sm font-normal text-muted-foreground ml-1">
								({Math.round((expiredCount / total) * 100)}%)
							</span>
						)}
					</div>
				</CardContent>
			</Card>
			<Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<WalletIcon className="h-4 w-4" />
						Avg. Due
					</div>
					<div className="text-2xl font-bold tabular-nums">
						{formatCurrency(avgDue)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | Date | null }) {
	if (!expiresAt) {
		return <span className="text-muted-foreground">&mdash;</span>;
	}

	const { label, variant } = getExpiryInfo(expiresAt);
	const date = new Date(expiresAt);

	return (
		<div className="flex flex-col items-start gap-1">
			<span className="text-sm tabular-nums">
				{date.toLocaleDateString()}
			</span>
			{label && (
				<Badge variant={variant} className="text-[10px] px-1.5 py-0">
					{label}
				</Badge>
			)}
		</div>
	);
}

type UnpaidCustomer = ReturnType<
	typeof useUnpaidCustomers
>["customers"][number];

function useUnpaidColumns({
	isOrganizationAdmin,
	onSelectCustomer,
}: {
	isOrganizationAdmin: boolean;
	onSelectCustomer: (customer: UnpaidCustomer) => void;
}) {
	return useMemo<ColumnDef<UnpaidCustomer, unknown>[]>(() => {
		const cols: ColumnDef<UnpaidCustomer, unknown>[] = [
			{
				id: "customer",
				header: "Customer",
				enableSorting: false,
				cell: ({ row }) => {
					const customer = row.original;
					const phone = customer.mobile ?? customer.phone;
					return (
						<div>
							<div className="font-medium">
								{displayName(
									customer.firstName,
									customer.lastName,
								)}
							</div>
							<div className="text-xs text-muted-foreground">
								{customer.username}
							</div>
							{phone && (
								<div className="text-xs text-muted-foreground">
									{phone}
								</div>
							)}
						</div>
					);
				},
			},
			{
				id: "area",
				header: "Area",
				enableSorting: false,
				cell: ({ row }) => {
					const customer = row.original;
					if (customer.groupName) {
						return (
							<Badge variant="outline" className="text-xs">
								{customer.groupName}
							</Badge>
						);
					}
					return (
						<span className="text-muted-foreground">&mdash;</span>
					);
				},
			},
		];

		if (isOrganizationAdmin) {
			cols.push({
				id: "collector",
				header: "Collector",
				enableSorting: false,
				cell: ({ row }) => {
					const customer = row.original;
					return (
						<span className="text-sm">
							{customer.collector?.name ?? (
								<span className="text-muted-foreground">
									Unassigned
								</span>
							)}
						</span>
					);
				},
			});
		}

		cols.push(
			{
				id: "dealer",
				header: "Dealer",
				enableSorting: false,
				cell: ({ row }) => {
					const customer = row.original;
					return (
						<span className="text-sm">
							{customer.dealer?.name ?? (
								<span className="text-muted-foreground">
									&mdash;
								</span>
							)}
						</span>
					);
				},
			},
			{
				id: "plan",
				header: "Plan",
				enableSorting: false,
				cell: ({ row }) => {
					const customer = row.original;
					const extras =
						(customer.iptvPrice ?? 0) + (customer.realIpPrice ?? 0);
					const discount = customer.discount ?? 0;
					return (
						<div>
							<div className="text-sm">
								{customer.plan?.name ?? "\u2014"}
							</div>
							{(extras > 0 || discount > 0) && (
								<div className="text-[11px] text-muted-foreground space-x-1">
									{customer.iptvPrice ? (
										<span>IPTV ${customer.iptvPrice}</span>
									) : null}
									{customer.realIpPrice ? (
										<span>
											RealIP ${customer.realIpPrice}
										</span>
									) : null}
									{discount > 0 ? (
										<span className="text-green-600">
											-${discount}
										</span>
									) : null}
								</div>
							)}
						</div>
					);
				},
			},
			{
				id: "expiry",
				header: "Expiry",
				enableSorting: false,
				cell: ({ row }) => {
					const customer = row.original;
					return (
						<ExpiryBadge expiresAt={customer.expiresAt ?? null} />
					);
				},
			},
			{
				id: "amountDue",
				header: "Amount Due",
				enableSorting: false,
				meta: { className: "text-right" },
				cell: ({ row }) => {
					const customer = row.original;
					const accountPrice =
						customer.monthlyRate ??
						customer.plan?.monthlyPrice ??
						0;
					const discount = customer.discount ?? 0;
					const totalDue = calculateTotalDue(customer);

					return (
						<div className="text-right">
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="font-semibold tabular-nums cursor-default">
										{formatCurrency(totalDue)}
									</span>
								</TooltipTrigger>
								<TooltipContent side="left">
									<div className="text-xs space-y-0.5">
										<div className="flex justify-between gap-4">
											<span>Base</span>
											<span>
												{formatCurrency(accountPrice)}
											</span>
										</div>
										{customer.iptvPrice ? (
											<div className="flex justify-between gap-4">
												<span>IPTV</span>
												<span>
													{formatCurrency(
														customer.iptvPrice,
													)}
												</span>
											</div>
										) : null}
										{customer.realIpPrice ? (
											<div className="flex justify-between gap-4">
												<span>Real IP</span>
												<span>
													{formatCurrency(
														customer.realIpPrice,
													)}
												</span>
											</div>
										) : null}
										{discount > 0 ? (
											<div className="flex justify-between gap-4 text-green-500">
												<span>Discount</span>
												<span>
													-{formatCurrency(discount)}
												</span>
											</div>
										) : null}
										<div className="border-t pt-0.5 font-semibold flex justify-between gap-4">
											<span>Total</span>
											<span>
												{formatCurrency(totalDue)}
											</span>
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</div>
					);
				},
			},
			{
				id: "actions",
				header: "Actions",
				enableSorting: false,
				meta: { className: "text-right" },
				cell: ({ row }) => {
					const customer = row.original;
					const phone = customer.mobile ?? customer.phone;
					const waLink = formatWhatsAppLink(phone);

					return (
						<div className="flex items-center justify-end gap-1">
							{phone && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											className="h-8 w-8"
											asChild
										>
											<a href={`tel:${phone}`}>
												<PhoneIcon className="size-3.5" />
											</a>
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										Call {phone}
									</TooltipContent>
								</Tooltip>
							)}
							{waLink && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											className="h-8 w-8 text-green-600"
											asChild
										>
											<a
												href={waLink}
												target="_blank"
												rel="noopener noreferrer"
											>
												<MessageCircleIcon className="size-3.5" />
											</a>
										</Button>
									</TooltipTrigger>
									<TooltipContent>WhatsApp</TooltipContent>
								</Tooltip>
							)}
							<Button
								size="sm"
								onClick={() => onSelectCustomer(customer)}
							>
								<BanknoteIcon className="mr-1 size-3.5" />
								Pay
							</Button>
						</div>
					);
				},
			},
		);

		return cols;
	}, [isOrganizationAdmin, onSelectCustomer]);
}

export function UnpaidCustomersList() {
	const { employee, isOrganizationAdmin } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);
	const [groupFilter, setGroupFilter] = useState("");
	const [collectorFilter, setCollectorFilter] = useState("");
	const [expiredOnly, setExpiredOnly] = useState(false);
	const [selectedCustomer, setSelectedCustomer] = useState<
		Parameters<typeof PaymentDialog>[0]["customer"] | null
	>(null);

	const isCollector = !isOrganizationAdmin && !!employee?.id;
	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;
	const { groups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];
	const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

	const { customers, total, totalAmountDue, expiredCount, isLoading } =
		useUnpaidCustomers({
			year: activeMonth?.year,
			month: activeMonth?.month,
			collectorId: isOrganizationAdmin
				? collectorFilter || undefined
				: employee?.id,
			search: debouncedSearch || undefined,
			groupName: groupFilter || undefined,
			excludeGroupName: groupFilter ? undefined : "free",
			expiryTo: expiredOnly ? today : undefined,
			page,
			pageSize: 25,
		});

	// Calculate total amount due across visible page (for the footer)
	const pageAmountDue = customers.reduce(
		(sum, c) => sum + calculateTotalDue(c),
		0,
	);

	function resetFilters() {
		setSearch("");
		setGroupFilter("");
		setCollectorFilter("");
		setExpiredOnly(false);
		setPage(1);
	}

	const hasActiveFilters =
		!!debouncedSearch || !!groupFilter || !!collectorFilter || expiredOnly;

	const columns = useUnpaidColumns({
		isOrganizationAdmin,
		onSelectCustomer: setSelectedCustomer,
	});

	return (
		<PageShell
			title="Collect Payments"
			description={`${total} unpaid customer${total !== 1 ? "s" : ""}`}
		>
			<div className="space-y-4">
				{isCollector && <CollectorStatsHeader />}
				<CollectionOverview
					total={total}
					totalAmountDue={totalAmountDue}
					expiredCount={expiredCount}
					isLoading={isLoading}
				/>

				{/* Filters */}
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<SearchInput
						value={search}
						onChange={(val) => {
							setSearch(val);
							setPage(1);
						}}
						placeholder="Search by name, username, or phone..."
						className="sm:max-w-xs"
					/>
					<div className="flex flex-1 items-center gap-2">
						<Select
							value={groupFilter || "all"}
							onValueChange={(val) => {
								setGroupFilter(val === "all" ? "" : val);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-[160px]">
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

						{isOrganizationAdmin && (
							<Select
								value={collectorFilter || "all"}
								onValueChange={(val) => {
									setCollectorFilter(
										val === "all" ? "" : val,
									);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue placeholder="All collectors" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All collectors
									</SelectItem>
									{collectors.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

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

						{hasActiveFilters && (
							<Button
								variant="ghost"
								size="sm"
								onClick={resetFilters}
								className="text-muted-foreground"
							>
								Clear filters
							</Button>
						)}
					</div>
				</div>

				<TooltipProvider>
					<DataTable
						columns={columns}
						data={customers}
						isLoading={isLoading}
						pagination={{
							totalItems: total,
							currentPage: page,
							itemsPerPage: 25,
							onPageChange: setPage,
						}}
						emptyState={
							<EmptyState
								icon={UsersIcon}
								title={
									hasActiveFilters
										? "No results"
										: "All paid up!"
								}
								description={
									hasActiveFilters
										? "Try adjusting your filters."
										: "No unpaid customers found."
								}
							/>
						}
					/>

					{customers.length > 0 && (
						<div className="flex items-center justify-between px-1 pt-2 text-sm text-muted-foreground">
							<span>
								Showing {customers.length} of {total} unpaid
							</span>
							<span className="font-medium text-foreground">
								Page total: {formatCurrency(pageAmountDue)}
							</span>
						</div>
					)}
				</TooltipProvider>
			</div>

			{selectedCustomer && (
				<PaymentDialog
					open={!!selectedCustomer}
					onOpenChange={(open) => {
						if (!open) {
							setSelectedCustomer(null);
						}
					}}
					customer={selectedCustomer}
				/>
			)}
		</PageShell>
	);
}

export function UnpaidCustomersListSkeleton() {
	return (
		<PageShell title="Collect Payments" description="Loading...">
			<div className="space-y-4">
				<div className="flex gap-2">
					<Skeleton className="h-10 w-64" />
					<Skeleton className="h-10 w-40" />
					<Skeleton className="h-10 w-44" />
					<Skeleton className="h-10 w-24" />
				</div>
				<div className="rounded-xl border bg-card">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0"
						>
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-20" />
							<Skeleton className="h-5 w-24" />
							<Skeleton className="h-5 w-20" />
							<Skeleton className="h-5 w-16 ml-auto" />
							<Skeleton className="h-8 w-16" />
						</div>
					))}
				</div>
			</div>
		</PageShell>
	);
}

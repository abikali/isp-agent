"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { useConfirmationAlert } from "@saas/shared/client";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
import { SearchInput } from "@shared/components/SearchInput";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import {
	formatCurrency,
	formatDate,
	formatDateInput,
} from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Skeleton } from "@ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	BanIcon,
	BanknoteIcon,
	CalendarXIcon,
	CheckIcon,
	DollarSignIcon,
	MessageCircleIcon,
	PhoneIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CustomerBulkActionsBar } from "../../customers/components/CustomerBulkActionsBar";
import {
	useCollectorStats,
	useCollectors,
	useCurrentMonth,
	useCustomerGroups,
	useUnpaidCustomers,
	useVoidUnpaidForCustomers,
} from "../hooks/use-billing";
import {
	customerMonthlyDue,
	formatCycleShort,
	getExpiryInfo,
} from "../lib/billing-utils";
import { formatWhatsAppLink } from "../lib/whatsapp";
import { CollectorSelect, GroupSelect } from "./BillingFilters";
import { BillingStatsCards } from "./BillingStatsCards";
import { PaymentDialog } from "./PaymentDialog";

function CollectorStatsHeader() {
	const { data: stats, isLoading } = useCollectorStats();

	return <BillingStatsCards stats={stats ?? null} isLoading={isLoading} />;
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
			<MetricStrip columns={4}>
				<MetricCardSkeleton />
				<MetricCardSkeleton />
				<MetricCardSkeleton />
				<MetricCardSkeleton />
			</MetricStrip>
		);
	}

	const avgDue = total > 0 ? totalAmountDue / total : 0;
	const expiredPct =
		total > 0 ? `${Math.round((expiredCount / total) * 100)}%` : "";

	return (
		<MetricStrip columns={4}>
			<MetricCard
				label="Unpaid"
				value={total}
				icon={UsersIcon}
				tone={total > 0 ? "warning" : "default"}
			/>
			<MetricCard
				label="To collect"
				value={formatCurrency(totalAmountDue)}
				icon={DollarSignIcon}
				tone={totalAmountDue > 0 ? "danger" : "default"}
			/>
			<MetricCard
				label="Billing expired"
				value={expiredCount}
				icon={CalendarXIcon}
				tone={expiredCount > 0 ? "warning" : "default"}
				hint={expiredPct ? `${expiredPct} of total` : undefined}
			/>
			<MetricCard
				label="Avg. due"
				value={formatCurrency(avgDue)}
				icon={WalletIcon}
				tone="info"
			/>
		</MetricStrip>
	);
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | Date | null }) {
	if (!expiresAt) {
		return <span className="text-muted-foreground">&mdash;</span>;
	}

	const { label, variant } = getExpiryInfo(expiresAt);

	return (
		<div className="flex flex-col items-start gap-1">
			<span className="text-sm tabular-nums">
				{formatDate(expiresAt)}
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

/**
 * Amount due for the collect list. Shows the full accumulated balance (what
 * the collector actually collects) and, when more than one month is involved,
 * a compact "N months unpaid" badge plus a per-month paid/unpaid breakdown on
 * hover — so admins can see at a glance which cycles are settled and which
 * are still owed.
 */
function AmountDueCell({ customer }: { customer: UnpaidCustomer }) {
	const monthlyDue = customer.monthlyDue ?? customerMonthlyDue(customer);
	const total = customer.accumulatedDue ?? monthlyDue;
	const unpaidMonths = customer.unpaidMonths ?? 1;
	const months = customer.months ?? [];
	// Only surface the breakdown when there's something to explain — a single
	// unpaid month with no history stays a clean one-line number.
	const hasBreakdown = months.length > 1 || unpaidMonths > 1;

	const amount = (
		<span className="font-semibold tabular-nums cursor-default">
			{formatCurrency(total)}
		</span>
	);

	if (!hasBreakdown) {
		return <div className="text-right">{amount}</div>;
	}

	return (
		<div className="flex flex-col items-end gap-1">
			<Tooltip>
				<TooltipTrigger asChild>{amount}</TooltipTrigger>
				<TooltipContent side="left" className="p-2">
					<div className="min-w-[180px]">
						<div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							Months billed
						</div>
						<div className="space-y-0.5">
							{months.map((m) => (
								<div
									key={`${m.year}-${m.month}`}
									className={cn(
										"flex items-center justify-between gap-3 text-xs",
										m.paid && "text-muted-foreground",
									)}
								>
									<span className="flex items-center gap-1.5">
										{m.paid ? (
											<CheckIcon className="size-3 text-emerald-500" />
										) : (
											<span className="size-1.5 rounded-full bg-amber-500" />
										)}
										{formatCycleShort(m.year, m.month)}
									</span>
									<span className="tabular-nums">
										{m.paid ? (
											<span className="text-emerald-500">
												Paid
											</span>
										) : (
											formatCurrency(m.amount)
										)}
									</span>
								</div>
							))}
						</div>
						<div className="mt-1 flex justify-between gap-3 border-t pt-1 text-xs font-semibold">
							<span>Total due</span>
							<span className="tabular-nums">
								{formatCurrency(total)}
							</span>
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
			<Badge
				variant="warning"
				className="px-1.5 py-0 text-[10px] font-medium"
			>
				{unpaidMonths} {unpaidMonths === 1 ? "month" : "months"} unpaid
			</Badge>
		</div>
	);
}

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
				accessorFn: (row) => row.firstName,
				enableSorting: true,
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
				accessorFn: (row) => row.groupName,
				enableSorting: true,
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
				header: "Billing Expiry",
				accessorFn: (row) => row.oldestUnpaidExpiry,
				enableSorting: true,
				cell: ({ row }) => {
					const customer = row.original;
					return (
						<ExpiryBadge
							expiresAt={customer.oldestUnpaidExpiry ?? null}
						/>
					);
				},
			},
			{
				id: "amountDue",
				header: "Amount Due",
				accessorFn: (row) => row.monthlyRate,
				enableSorting: true,
				meta: { className: "text-right" },
				cell: ({ row }) => <AmountDueCell customer={row.original} />,
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
											<a
												href={`tel:${phone}`}
												aria-label={`Call ${phone}`}
											>
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
												aria-label="Chat on WhatsApp"
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

const SORT_BY_MAP = {
	customer: "firstName",
	area: "groupName",
	expiry: "oldestUnpaidExpiry",
	amountDue: "monthlyRate",
} as const satisfies Record<
	string,
	"oldestUnpaidExpiry" | "firstName" | "groupName" | "monthlyRate"
>;

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/pagination state slices, not a related state machine
export function UnpaidCustomersList() {
	const { employee, isOrganizationAdmin, activeOrganization } =
		useActiveOrganization();
	const organizationId = activeOrganization?.id ?? null;
	const { confirm } = useConfirmationAlert();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);
	const [groupFilter, setGroupFilter] = useState("");
	const [collectorFilter, setCollectorFilter] = useState("");
	const [expiredOnly, setExpiredOnly] = useState(false);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		() => setPage(1),
	);
	const [selectedCustomer, setSelectedCustomer] = useState<
		Parameters<typeof PaymentDialog>[0]["customer"] | null
	>(null);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const isCollector = !isOrganizationAdmin && !!employee?.id;

	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;
	const { groups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];
	const today = formatDateInput();

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
			sortBy,
			sortOrder,
		});

	// Calculate total amount due across visible page (for the footer).
	// Uses the full accumulated balance so it matches the per-row amounts.
	const pageAmountDue = customers.reduce(
		(sum, c) => sum + (c.accumulatedDue ?? customerMonthlyDue(c)),
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

	const voidUnpaidMutation = useVoidUnpaidForCustomers();
	const selectedCustomerIds = useMemo(
		() => Object.keys(rowSelection),
		[rowSelection],
	);
	const selectedCount = selectedCustomerIds.length;

	function handleVoidSelected() {
		if (!organizationId || selectedCount === 0) {
			return;
		}
		confirm({
			title: `Void unpaid invoices for ${selectedCount} customer${
				selectedCount === 1 ? "" : "s"
			}?`,
			message:
				"All unpaid invoices for the selected customers will be excluded from collector lists and billing stats, but kept in history. You can restore them later from the Invoices page.",
			confirmLabel: "Void",
			onConfirm: async () => {
				try {
					const result = await voidUnpaidMutation.mutateAsync({
						organizationId,
						customerIds: selectedCustomerIds,
						...(activeMonth?.year !== undefined
							? { year: activeMonth.year }
							: {}),
						...(activeMonth?.month !== undefined
							? { month: activeMonth.month }
							: {}),
					});
					setRowSelection({});
					toast.success(
						`${result.count} invoice${result.count === 1 ? "" : "s"} voided`,
					);
				} catch (err) {
					toast.error(
						err instanceof Error
							? err.message
							: "Failed to void invoices",
					);
				}
			},
		});
	}

	return (
		<>
			{isCollector && <CollectorStatsHeader />}
			<CollectionOverview
				total={total}
				totalAmountDue={totalAmountDue}
				expiredCount={expiredCount}
				isLoading={isLoading}
			/>

			{isOrganizationAdmin && organizationId && selectedCount > 0 && (
				<CustomerBulkActionsBar
					count={selectedCount}
					customerIds={selectedCustomerIds}
					organizationId={organizationId}
					collectors={collectors}
					onCleared={() => setRowSelection({})}
					extraActions={
						<Button
							size="sm"
							variant="outline"
							disabled={voidUnpaidMutation.isPending}
							onClick={handleVoidSelected}
							className="text-destructive hover:text-destructive"
						>
							<BanIcon className="mr-2 size-4" />
							Void unpaid
						</Button>
					}
				/>
			)}

			<ContentCard>
				<ContentCardToolbar>
					<SearchInput
						value={search}
						onChange={(val) => {
							setSearch(val);
							setPage(1);
						}}
						placeholder="Search by name, username, or phone..."
						className="sm:max-w-xs"
					/>
					<GroupSelect
						value={groupFilter}
						onChange={(val) => {
							setGroupFilter(val);
							setPage(1);
						}}
						groups={groups}
						excludeFree
					/>

					{isOrganizationAdmin && (
						<CollectorSelect
							value={collectorFilter}
							onChange={(val) => {
								setCollectorFilter(val);
								setPage(1);
							}}
							collectors={collectors}
							includeUnassigned
							className="w-full sm:w-[180px]"
						/>
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
						Billing Expired
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
				</ContentCardToolbar>

				<TooltipProvider>
					<DataTable
						columns={columns}
						data={customers}
						isLoading={isLoading}
						sorting={sorting}
						onSortingChange={onSortingChange}
						pagination={{
							totalItems: total,
							currentPage: page,
							itemsPerPage: 25,
							onPageChange: (p) => {
								setPage(p);
								setRowSelection({});
							},
						}}
						enableRowSelection={isOrganizationAdmin}
						rowSelection={rowSelection}
						onRowSelectionChange={setRowSelection}
						getRowId={(row) => row.id}
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
				</TooltipProvider>
			</ContentCard>

			{customers.length > 0 && (
				<div className="flex flex-col gap-1 px-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<span>
						Showing {customers.length} of {total} unpaid
					</span>
					<span className="font-medium text-foreground">
						Page total: {formatCurrency(pageAmountDue)}
					</span>
				</div>
			)}

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
		</>
	);
}

export function UnpaidCustomersListSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row">
					<Skeleton className="h-10 w-full sm:w-64" />
					<Skeleton className="h-10 w-full sm:w-40" />
					<Skeleton className="h-10 w-full sm:w-44" />
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
		</div>
	);
}

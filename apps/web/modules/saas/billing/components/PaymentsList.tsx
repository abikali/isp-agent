"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
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
	AlertTriangleIcon,
	ArrowDownIcon,
	ArrowUpIcon,
	CheckCircle2Icon,
	CheckIcon,
	CircleDotIcon,
	FilterIcon,
	ListIcon,
	RotateCcwIcon,
	TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useCollectors,
	useCustomerGroups,
	useDeletePayment,
	useMonthFilter,
	usePaymentStatsQuery,
	usePaymentsQuery,
	useReviewPayment,
} from "../hooks/use-billing";
import {
	FLAG_LEGEND,
	getPaymentFlagLabel,
	getPaymentFlagVariant,
	getPaymentRowClassName,
	isAmountMismatch,
	isUnreviewed,
	NOTE_CATEGORY_LABELS,
} from "../lib/billing-utils";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { CollectorSelect, GroupSelect } from "./BillingFilters";

const PAGE_SIZE = 25;

const SORT_BY_MAP = {
	date: "paidAt",
	amount: "paidAmount",
	status: "stoppedAccount",
} as const;

type PaymentTypeFilter =
	| "all"
	| "collected"
	| "stopped"
	| "free"
	| "overpaid"
	| "underpaid"
	| "mismatch"
	| "needs_review";

interface PaymentRow {
	id: string;
	customer: {
		firstName: string | null;
		lastName: string | null;
		username: string | null;
	};
	collector: { id: string; name: string };
	paidAt: string | Date;
	accountPrice: number;
	paidAmount: number;
	discount: number;
	freeAccount: boolean;
	stoppedAccount: boolean;
	noteCategory: string | null;
	notes: string | null;
	reviewedAt: string | Date | null;
}

function StatsBar({ billingMonthId }: { billingMonthId: string | undefined }) {
	const { data: stats } = usePaymentStatsQuery(billingMonthId);

	if (!stats) {
		return null;
	}

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatCard
				label="Collected"
				value={formatCurrency(stats.totalCollected)}
				sub={`${stats.collectedPayments} payments`}
				className="text-emerald-600 dark:text-emerald-400"
			/>
			<StatCard
				label="Stopped"
				value={String(stats.stoppedPayments)}
				sub="accounts"
				className="text-red-600 dark:text-red-400"
			/>
			<StatCard
				label="Unpaid"
				value={String(stats.unpaidCustomers)}
				sub="customers"
				className="text-orange-600 dark:text-orange-400"
			/>
			<StatCard
				label="Needs Review"
				value={String(stats.unreviewedCount)}
				sub="flagged"
				className={
					stats.unreviewedCount > 0
						? "text-amber-600 dark:text-amber-400"
						: "text-muted-foreground"
				}
			/>
		</div>
	);
}

function StatCard({
	label,
	value,
	sub,
	className,
}: {
	label: string;
	value: string;
	sub: string;
	className?: string;
}) {
	return (
		<div className="rounded-lg border bg-card px-4 py-3">
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			<p className={`text-lg font-bold tabular-nums ${className ?? ""}`}>
				{value}
			</p>
			<p className="text-xs text-muted-foreground">{sub}</p>
		</div>
	);
}

const TYPE_FILTERS: {
	key: PaymentTypeFilter;
	label: string;
	icon?: typeof CheckCircle2Icon;
}[] = [
	{ key: "all", label: "All" },
	{ key: "collected", label: "Collected", icon: CheckCircle2Icon },
	{ key: "stopped", label: "Stopped", icon: CircleDotIcon },
	{ key: "free", label: "Free" },
	{ key: "mismatch", label: "All Mismatch", icon: AlertTriangleIcon },
	{ key: "overpaid", label: "Overpaid", icon: ArrowUpIcon },
	{ key: "underpaid", label: "Underpaid", icon: ArrowDownIcon },
	{ key: "needs_review", label: "Needs Review", icon: FilterIcon },
];

const NOTE_CATEGORIES = Object.entries(NOTE_CATEGORY_LABELS);

function deriveQueryFilters(typeFilter: PaymentTypeFilter): {
	stoppedAccount?: boolean;
	freeAccount?: boolean;
	unreviewedOnly?: boolean;
	amountMismatch?: "any" | "overpaid" | "underpaid";
} {
	switch (typeFilter) {
		case "collected":
			return { stoppedAccount: false, freeAccount: false };
		case "stopped":
			return { stoppedAccount: true };
		case "free":
			return { freeAccount: true };
		case "mismatch":
			return { amountMismatch: "any" };
		case "overpaid":
			return { amountMismatch: "overpaid" };
		case "underpaid":
			return { amountMismatch: "underpaid" };
		case "needs_review":
			return { unreviewedOnly: true };
		default:
			return {};
	}
}

export function PaymentsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [typeFilter, setTypeFilter] = useState<PaymentTypeFilter>("all");
	const [collectorFilter, setCollectorFilter] = useState<
		string | undefined
	>();
	const [groupFilter, setGroupFilter] = useState<string | undefined>();
	const [noteCategoryFilter, setNoteCategoryFilter] = useState<
		string | undefined
	>();
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		() => setPage(1),
	);
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		options: monthOptions,
	} = useMonthFilter();

	// Reset page when filters change
	const resetPage = () => setPage(1);
	const handleTypeChange = (t: PaymentTypeFilter) => {
		setTypeFilter(t);
		resetPage();
	};
	const handleCollectorChange = (value: string) => {
		setCollectorFilter(value || undefined);
		resetPage();
	};
	const handleGroupChange = (value: string) => {
		setGroupFilter(value || undefined);
		resetPage();
	};
	const handleMonthChange = (value: string) => {
		setMonthFilter(value);
		resetPage();
	};
	const handleNoteCategoryChange = (value: string) => {
		setNoteCategoryFilter(value === "all" ? undefined : value);
		resetPage();
	};

	const queryTypeFilters = deriveQueryFilters(typeFilter);

	const { payments, total, isLoading, isFetching } = usePaymentsQuery({
		search: debouncedSearch || undefined,
		...queryTypeFilters,
		noteCategory: noteCategoryFilter,
		collectorId: collectorFilter,
		groupName: groupFilter,
		billingMonthId: activeMonthId,
		page,
		pageSize: PAGE_SIZE,
		sortBy,
		sortOrder,
	});

	const { data: collectorsData } = useCollectors();
	const { groups } = useCustomerGroups();
	const collectors = collectorsData?.collectors ?? [];

	const organizationId = useOrganizationId();
	const deletePayment = useDeletePayment();
	const reviewPayment = useReviewPayment();

	const rowClassName = (row: { original: PaymentRow }) =>
		getPaymentRowClassName(row.original);

	const hasActiveFilters =
		typeFilter !== "all" ||
		!!collectorFilter ||
		!!groupFilter ||
		!!noteCategoryFilter ||
		(!!monthFilter && monthFilter !== "all") ||
		!!search;

	const resetFilters = () => {
		setSearch("");
		setTypeFilter("all");
		setCollectorFilter(undefined);
		setGroupFilter(undefined);
		setNoteCategoryFilter(undefined);
		setMonthFilter("");
		setPage(1);
	};

	const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(
		() => [
			{
				id: "invoice",
				header: "Invoice",
				enableSorting: false,
				meta: { className: "w-28" },
				cell: ({ row }) => (
					<a
						href={`/invoice/${row.original.id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="font-mono text-xs text-blue-600 hover:underline"
					>
						#{row.original.id.slice(-8).toUpperCase()}
					</a>
				),
			},
			{
				id: "customer",
				header: "Customer",
				enableSorting: false,
				cell: ({ row }) => (
					<>
						<div className="font-medium">
							{displayName(
								row.original.customer.firstName,
								row.original.customer.lastName,
							)}
						</div>
						<div className="text-xs text-muted-foreground">
							{row.original.customer.username}
						</div>
					</>
				),
			},
			{
				id: "collector",
				header: "Collector",
				enableSorting: false,
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.collector.name}
					</span>
				),
			},
			{
				id: "date",
				header: "Date",
				accessorFn: (row) => row.paidAt,
				enableSorting: true,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{new Date(row.original.paidAt).toLocaleDateString()}
					</span>
				),
			},
			{
				id: "amount",
				header: "Amount",
				accessorFn: (row) => row.paidAmount,
				enableSorting: true,
				meta: { className: "text-right" },
				cell: ({ row }) => {
					const p = row.original;
					const mismatch = isAmountMismatch(p);
					const expected = p.accountPrice - p.discount;
					return (
						<div className="text-right">
							<span className="font-semibold tabular-nums">
								{formatCurrency(p.paidAmount)}
							</span>
							{mismatch && (
								<div className="text-xs text-muted-foreground tabular-nums">
									of {formatCurrency(expected)}
								</div>
							)}
						</div>
					);
				},
			},
			{
				id: "status",
				header: "Status",
				accessorFn: (row) => row.stoppedAccount,
				enableSorting: true,
				cell: ({ row }) => {
					const payment = row.original;
					const variant = getPaymentFlagVariant(payment);
					const label = getPaymentFlagLabel(payment);
					const needsReview = isUnreviewed(payment);
					return (
						<div className="flex items-center gap-1.5">
							<Badge variant={variant}>{label}</Badge>
							{needsReview && (
								<Tooltip>
									<TooltipTrigger asChild>
										<span className="relative flex size-2">
											<span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
											<span className="relative inline-flex size-2 rounded-full bg-amber-500" />
										</span>
									</TooltipTrigger>
									<TooltipContent>
										Needs review
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					);
				},
			},
			{
				id: "note",
				header: "Note",
				enableSorting: false,
				cell: ({ row }) => {
					const category = row.original.noteCategory;
					const notes = row.original.notes;
					if (!category && !notes) {
						return (
							<span className="text-muted-foreground">
								{"\u2014"}
							</span>
						);
					}
					return (
						<div className="whitespace-nowrap">
							{category && (
								<Badge
									variant="outline"
									className="text-xs font-normal"
								>
									{NOTE_CATEGORY_LABELS[category] ?? category}
								</Badge>
							)}
							{notes && (
								<span className="block text-xs text-muted-foreground mt-0.5">
									{notes}
								</span>
							)}
						</div>
					);
				},
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-1">
						{organizationId && isUnreviewed(row.original) && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant="ghost"
										className="text-emerald-600"
										onClick={() =>
											reviewPayment.mutate(
												{
													organizationId,
													paymentId: row.original.id,
												},
												{
													onSuccess: () =>
														toast.success(
															"Marked as reviewed",
														),
													onError: (error) =>
														toast.error(
															error.message,
														),
												},
											)
										}
									>
										<CheckIcon className="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									Mark as reviewed
								</TooltipContent>
							</Tooltip>
						)}
						{organizationId && (
							<AlertDialog>
								<Tooltip>
									<TooltipTrigger asChild>
										<AlertDialogTrigger asChild>
											<Button
												size="sm"
												variant="ghost"
												className="text-destructive"
											>
												<TrashIcon className="size-3.5" />
											</Button>
										</AlertDialogTrigger>
									</TooltipTrigger>
									<TooltipContent>
										Delete payment
									</TooltipContent>
								</Tooltip>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Delete payment?
										</AlertDialogTitle>
										<AlertDialogDescription>
											This will permanently delete this
											payment of{" "}
											{formatCurrency(
												row.original.paidAmount,
											)}{" "}
											and reset the customer&apos;s paid
											status.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={() =>
												deletePayment.mutate(
													{
														organizationId,
														paymentId:
															row.original.id,
													},
													{
														onSuccess: () =>
															toast.success(
																"Payment deleted",
															),
														onError: (error) =>
															toast.error(
																error.message,
															),
													},
												)
											}
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}
					</div>
				),
			},
		],
		[organizationId, deletePayment, reviewPayment],
	);

	return (
		<PageShell
			title="Payments"
			description={isLoading ? "Loading..." : `${total} payment records`}
		>
			<div className="space-y-4">
				{/* Stats Summary */}
				<StatsBar billingMonthId={activeMonthId} />

				{/* Search + Dropdown Filters */}
				<div className="flex flex-wrap items-center gap-2 sm:gap-3">
					<SearchInput
						value={search}
						onChange={(v) => {
							setSearch(v);
							setPage(1);
						}}
						placeholder="Search customer or invoice..."
						className="w-full sm:max-w-xs"
					/>

					<CollectorSelect
						value={collectorFilter ?? ""}
						onChange={handleCollectorChange}
						collectors={collectors}
					/>

					<GroupSelect
						value={groupFilter ?? ""}
						onChange={handleGroupChange}
						groups={groups}
					/>

					<BillingCycleSelect
						value={monthFilter || activeMonthId || "all"}
						onValueChange={handleMonthChange}
						options={monthOptions}
						allLabel="All Months"
					/>

					<Select
						value={noteCategoryFilter ?? "all"}
						onValueChange={handleNoteCategoryChange}
					>
						<SelectTrigger className="w-full sm:w-[160px]">
							<SelectValue placeholder="All categories" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All categories</SelectItem>
							{NOTE_CATEGORIES.map(([key, label]) => (
								<SelectItem key={key} value={key}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={resetFilters}
						>
							<RotateCcwIcon className="mr-1 size-3.5" />
							Reset
						</Button>
					)}
				</div>

				{/* Type Filter Buttons */}
				<div className="space-y-2">
					<div className="flex flex-wrap gap-1">
						{TYPE_FILTERS.map((f) => {
							const active = typeFilter === f.key;
							return (
								<Button
									key={f.key}
									size="sm"
									variant={active ? "secondary" : "outline"}
									onClick={() => handleTypeChange(f.key)}
								>
									{f.icon && (
										<f.icon className="mr-1 size-3.5" />
									)}
									{f.label}
								</Button>
							);
						})}
					</div>

					{/* Legend */}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
						{FLAG_LEGEND.map((f) => (
							<div
								key={f.type}
								className="flex items-center gap-1.5"
							>
								<span
									className={`inline-block size-2.5 rounded-sm ${f.className}`}
								/>
								<span>{f.label}</span>
							</div>
						))}
					</div>
				</div>

				<TooltipProvider>
					<DataTable
						columns={columns}
						data={payments}
						isLoading={isLoading}
						isFetching={isFetching}
						getRowClassName={rowClassName}
						sorting={sorting}
						onSortingChange={onSortingChange}
						pagination={{
							totalItems: total,
							currentPage: page,
							itemsPerPage: PAGE_SIZE,
							onPageChange: setPage,
						}}
						emptyState={
							<EmptyState
								icon={ListIcon}
								title="No payments"
								description="No payment records match your filters."
							/>
						}
					/>
				</TooltipProvider>
			</div>
		</PageShell>
	);
}

export function PaymentsListSkeleton() {
	return (
		<PageShell title="Payments" description="Loading...">
			<div className="space-y-4">
				{/* Stats skeleton */}
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-20 rounded-lg" />
					))}
				</div>
				<Skeleton className="h-10 w-full" />
				<div className="rounded-xl border bg-card p-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4 py-3">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-20" />
							<Skeleton className="h-5 w-16" />
							<Skeleton className="ml-auto h-5 w-16" />
						</div>
					))}
				</div>
			</div>
		</PageShell>
	);
}

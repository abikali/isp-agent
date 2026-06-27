"use client";

import {
	StatCard,
	StatCardGroup,
	StatCardSkeleton,
} from "@shared/components/StatCard";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
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
import { Card, CardContent } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Progress } from "@ui/components/progress";
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
	ChevronLeftIcon,
	ChevronRightIcon,
	HandCoinsIcon,
	MoreHorizontalIcon,
	ReceiptTextIcon,
	SearchIcon,
	TrashIcon,
	WalletIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useCollections,
	useCollectorBalance,
	useCollectors,
	useCreateCollection,
	useCustomerGroups,
	useDeleteCollection,
	useDeletePayment,
	useMonthFilter,
} from "../hooks/use-billing";
import {
	formatCycleShort,
	getPaymentStatusLabel,
	getPaymentStatusVariant,
	NOTE_CATEGORY_LABELS,
} from "../lib/billing-utils";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { GroupSelect } from "./BillingFilters";

const HANDOFF_SORT_BY_MAP = {
	collectedAt: "collectedAt",
	amount: "amount",
	type: "type",
} as const satisfies Record<string, "collectedAt" | "amount" | "type">;

export function CashCollectionPageSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<Skeleton className="h-10 w-full max-w-xs" />
			<div className="grid gap-4 sm:grid-cols-3">
				<Skeleton className="h-24" />
				<Skeleton className="h-24" />
				<Skeleton className="h-24" />
			</div>
			<Skeleton className="h-64" />
		</div>
	);
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase();
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive cash-collection feature file; collector picker, page, handoff card and tables share billing state/columns and belong together
export function CollectorPickerPage({ basePath }: { basePath: string }) {
	const { data: collectorsData, isLoading } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-2xl font-bold tracking-tight">
					Cash Collection
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Pick a collector to manage their cash
				</p>
			</div>

			{isLoading ? (
				<div className="divide-y divide-border rounded-lg border">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-14" />
					))}
				</div>
			) : collectors.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-16 text-center">
						<HandCoinsIcon className="size-12 text-muted-foreground/30" />
						<p className="text-lg font-medium">
							No collectors found
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="divide-y divide-border rounded-lg border bg-card">
					{collectors.map((c) => {
						const progress =
							c.monthTotal > 0
								? Math.round(
										(c.monthCollected / c.monthTotal) * 100,
									)
								: 0;
						const hasBalance = c.inHand > 0;

						return (
							<a
								key={c.id}
								href={`${basePath}/${c.username ?? c.id}`}
								className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-4"
							>
								{/* Avatar */}
								<div className="size-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
									{getInitials(c.name)}
								</div>

								{/* Name + meta */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="truncate text-sm font-semibold">
											{c.name}
										</span>
										{c.username && (
											<span className="hidden truncate text-xs text-muted-foreground sm:inline">
												@{c.username}
											</span>
										)}
									</div>
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<span>{c.customerCount} customers</span>
										{c.stoppedCount > 0 && (
											<span className="text-red-500 dark:text-red-400">
												· {c.stoppedCount} stopped
											</span>
										)}
									</div>
								</div>

								{/* In hand */}
								<div className="hidden shrink-0 text-right sm:block">
									<p className="text-[10px] uppercase tracking-wide text-muted-foreground">
										In hand
									</p>
									<p
										className={`text-sm font-semibold tabular-nums leading-tight ${hasBalance ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}
									>
										{formatCurrency(c.inHand)}
									</p>
								</div>

								{/* Collected progress */}
								<div className="hidden w-40 shrink-0 md:block">
									<div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
										<span>Collected</span>
										<span className="font-medium tabular-nums text-foreground">
											{progress}%
										</span>
									</div>
									<Progress
										value={progress}
										className="h-1.5 mt-1"
									/>
									<p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
										{c.monthCollected} / {c.monthTotal}
									</p>
								</div>

								{/* Mobile: compact in-hand inline */}
								<div className="flex shrink-0 flex-col items-end text-right sm:hidden">
									<span
										className={`text-sm font-semibold tabular-nums ${hasBalance ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}
									>
										{formatCurrency(c.inHand)}
									</span>
									<span className="text-[10px] tabular-nums text-muted-foreground">
										{progress}% collected
									</span>
								</div>

								<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
							</a>
						);
					})}
				</div>
			)}
		</div>
	);
}

/** Non-suspense payments query for use inside this page */
function useCollectorPayments(filters: {
	collectorId: string | null;
	billingMonthId?: string;
	stoppedAccount?: boolean;
	groupName?: string;
	search?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId && filters.collectorId
			? orpc.billing.payments.list.queryOptions({
					input: {
						organizationId,
						collectorId: filters.collectorId,
						billingMonthId: filters.billingMonthId,
						stoppedAccount: filters.stoppedAccount,
						groupName: filters.groupName,
						search: filters.search || undefined,
						page: filters.page ?? 1,
						pageSize: filters.pageSize ?? 25,
						sortBy: "paidAt",
						sortOrder: "desc",
					},
				})
			: disabledQuery([
					"billing",
					"payments",
					"list",
					"collector",
					String(filters.stoppedAccount ?? "all"),
				]),
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component, react-doctor/no-multi-comp -- cohesive cash-collection feature page; sections share collector/page/filter state and splitting would scatter tightly-coupled billing logic
export function CashCollectionPage({
	collectorId,
	collectorName,
}: {
	collectorId: string;
	collectorName: string;
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- these are independent UI slices (page, tab, status/group filters, search); a reducer would not group them meaningfully
}) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);
	const [tab, setTab] = useState<"payments" | "handoffs">("payments");

	const {
		sorting: handoffSorting,
		sortBy: handoffSortBy,
		sortOrder: handoffSortOrder,
		onSortingChange: onHandoffSortingChange,
	} = useServerSorting(HANDOFF_SORT_BY_MAP, () => setPage(1));
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [groupFilter, setGroupFilter] = useState<string>("");
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(timer);
	}, [search]);

	const { groups } = useCustomerGroups();
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		options: monthOptions,
	} = useMonthFilter();

	const { data: balanceData, isLoading: balanceLoading } =
		useCollectorBalance(collectorId);

	const { data: collectionsData } = useCollections({
		collectorId,
		page: tab === "handoffs" ? page : 1,
		sortBy: handoffSortBy,
		sortOrder: handoffSortOrder,
	});

	const stoppedAccount =
		statusFilter === "stopped"
			? true
			: statusFilter === "collected"
				? false
				: undefined;

	const {
		data: paymentsData,
		isLoading: paymentsLoading,
		isFetching: paymentsFetching,
	} = useCollectorPayments({
		collectorId,
		billingMonthId: activeMonthId,
		stoppedAccount,
		groupName: groupFilter || undefined,
		search: debouncedSearch || undefined,
		page,
		pageSize: 25,
	});

	const createCollection = useCreateCollection();
	const deleteCollection = useDeleteCollection();

	const balance = balanceData?.balance ?? 0;

	const form = useForm({
		defaultValues: {
			amount: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				createCollection.mutateAsync({
					organizationId,
					collectorId,
					amount: Number(value.amount),
					notes: value.notes || undefined,
				}),
				{
					loading: "Recording collection...",
					success: () => {
						form.reset();
						return "Collection recorded";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to record collection",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	function handleCollectAll() {
		if (balance > 0) {
			form.setFieldValue("amount", String(balance));
		}
	}

	function handleDelete(collectionId: string) {
		if (!organizationId) {
			return;
		}
		toast.promise(
			deleteCollection.mutateAsync({ organizationId, collectionId }),
			{
				loading: "Deleting...",
				success: "Collection record deleted",
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to delete",
			},
		);
	}

	const payments = paymentsData?.payments ?? [];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h2 className="text-2xl font-bold tracking-tight">
					{collectorName}
				</h2>
				<p className="text-sm text-muted-foreground">
					Cash collection and handoff tracking
				</p>
			</div>

			{/* Balance + Stats Cards */}
			{balanceLoading ? (
				<StatCardGroup columns={4}>
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
					<StatCardSkeleton />
				</StatCardGroup>
			) : (
				(() => {
					const monthBillCount = balanceData?.monthBillCount ?? 0;
					const monthPaidCount = balanceData?.monthPaidCount ?? 0;
					const monthAmountCollected =
						balanceData?.monthAmountCollected ?? 0;
					const monthAmountDue = balanceData?.monthAmountDue ?? 0;
					const unpaidCount = Math.max(
						0,
						monthBillCount - monthPaidCount,
					);
					const remaining = Math.max(
						0,
						monthAmountDue - monthAmountCollected,
					);
					const settledPct =
						monthBillCount > 0
							? Math.round(
									(monthPaidCount / monthBillCount) * 100,
								)
							: 0;
					const billsHelper =
						monthBillCount === 0
							? "No bills this cycle"
							: unpaidCount === 0
								? "All collected this cycle"
								: `${settledPct}% settled • ${unpaidCount} to go`;
					const remainingHelper =
						monthBillCount === 0
							? "Nothing billed yet"
							: unpaidCount === 0
								? "All bills collected"
								: `${unpaidCount} bills still to collect`;
					return (
						<StatCardGroup columns={4}>
							<StatCard
								title="In Hand"
								value={formatCurrency(balance)}
								icon={WalletIcon}
								color="amber"
								description="Cash on you to hand off"
							/>
							<StatCard
								title="Bills"
								value={`${monthPaidCount}/${monthBillCount}`}
								icon={ReceiptTextIcon}
								color="blue"
								description={billsHelper}
							/>
							<StatCard
								title="Collected"
								value={formatCurrency(monthAmountCollected)}
								icon={BanknoteIcon}
								color="emerald"
								description="This cycle"
							/>
							<StatCard
								title="Remaining"
								value={formatCurrency(remaining)}
								icon={HandCoinsIcon}
								color="red"
								description={remainingHelper}
							/>
						</StatCardGroup>
					);
				})()
			)}

			{/* Handoff form */}
			<HandoffCard
				balance={balance}
				handoffForm={form}
				isSubmittingHandoff={isSubmitting}
				onCollectAll={handleCollectAll}
			/>

			{/* Tabs: Recent Payments / Handoff History */}
			<div className="space-y-3">
				<div className="flex gap-1 border-b">
					<button
						type="button"
						onClick={() => {
							setTab("payments");
							setPage(1);
						}}
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							tab === "payments"
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<ReceiptTextIcon className="mr-1.5 inline size-3.5" />
						Payments
						{paymentsData?.total != null
							? ` (${paymentsData.total})`
							: ""}
					</button>
					<button
						type="button"
						onClick={() => {
							setTab("handoffs");
							setPage(1);
						}}
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							tab === "handoffs"
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<HandCoinsIcon className="mr-1.5 inline size-3.5" />
						Handoff History
						{collectionsData?.total
							? ` (${collectionsData.total})`
							: ""}
					</button>
				</div>

				{tab === "payments" ? (
					<>
						{/* Payment Filters */}
						<div className="flex flex-wrap gap-2">
							<div className="relative min-w-0 flex-1 sm:flex-none">
								<SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
								<Input
									placeholder="Search customer..."
									value={search}
									onChange={(e) => {
										setSearch(e.target.value);
										setPage(1);
									}}
									className="w-full sm:w-48 pl-8"
								/>
							</div>
							<Select
								value={statusFilter || "all"}
								onValueChange={(val) => {
									setStatusFilter(val === "all" ? "" : val);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-full sm:w-36">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All statuses
									</SelectItem>
									<SelectItem value="collected">
										Collected
									</SelectItem>
									<SelectItem value="stopped">
										Stopped
									</SelectItem>
								</SelectContent>
							</Select>
							<GroupSelect
								value={groupFilter}
								onChange={(val) => {
									setGroupFilter(val);
									setPage(1);
								}}
								groups={groups}
								className="w-full sm:w-40"
							/>
							<BillingCycleSelect
								value={monthFilter || activeMonthId || ""}
								onValueChange={(val) => {
									setMonthFilter(val);
									setPage(1);
								}}
								options={monthOptions}
								allLabel="All Months"
							/>
						</div>

						<PaymentsTable
							payments={payments}
							total={paymentsData?.total ?? 0}
							page={page}
							onPageChange={setPage}
							isLoading={paymentsLoading}
							isFetching={paymentsFetching}
							collectorName={collectorName}
						/>
					</>
				) : (
					<HandoffsTable
						collections={collectionsData?.collections ?? []}
						total={collectionsData?.total ?? 0}
						page={page}
						onPageChange={setPage}
						onDelete={handleDelete}
						sorting={handoffSorting}
						onSortingChange={onHandoffSortingChange}
					/>
				)}
			</div>
		</div>
	);
}

// ─── Handoff Card ──────────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive cash-collection feature file; private helper component of CashCollectionPage
function HandoffCard({
	balance,
	handoffForm,
	isSubmittingHandoff,
	onCollectAll,
}: {
	balance: number;
	// biome-ignore lint/suspicious/noExplicitAny: TanStack Form generic is too complex to type inline
	handoffForm: any;
	isSubmittingHandoff: boolean;
	onCollectAll: () => void;
}) {
	return (
		<Card className="border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 overflow-hidden">
			<div className="px-4 py-3">
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- client-side TanStack Form submitting via oRPC mutation; no server action exists, preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handoffForm.handleSubmit();
					}}
					className="flex flex-wrap items-end gap-2"
				>
					<handoffForm.Field name="amount">
						{(field: {
							state: { value: string };
							handleChange: (v: string) => void;
						}) => (
							<div className="flex items-center gap-1.5">
								<Input
									type="number"
									step="0.01"
									min="0.01"
									placeholder="0.00"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									className="w-28 h-8 text-sm"
									required
								/>
								{balance > 0 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 shrink-0 text-xs"
										onClick={onCollectAll}
									>
										All ({formatCurrency(balance)})
									</Button>
								)}
							</div>
						)}
					</handoffForm.Field>
					<handoffForm.Field name="notes">
						{(field: {
							state: { value: string };
							handleChange: (v: string) => void;
						}) => (
							<Input
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value)
								}
								placeholder="Note (optional)"
								className="h-8 text-sm flex-1 min-w-[120px]"
							/>
						)}
					</handoffForm.Field>
					<Button
						type="submit"
						size="sm"
						disabled={isSubmittingHandoff}
						className="h-8 shrink-0"
					>
						<BanknoteIcon className="mr-1.5 size-3.5" />
						{isSubmittingHandoff
							? "Recording..."
							: "Record Handoff"}
					</Button>
				</form>
			</div>
		</Card>
	);
}

// ─── Recent Payments Table ─────────────────────────────────────────

function formatCycleLabel(cycle: { year: number; month: number }) {
	return formatCycleShort(cycle.year, cycle.month);
}

interface Payment {
	id: string;
	paidAmount: number;
	accountPrice: number;
	discount: number;
	stoppedAccount: boolean;
	noteCategory: string | null;
	notes: string | null;
	paidAt: string | Date;
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		groupName: string | null;
	};
	billingMonth: { year: number; month: number } | null;
}

function getPaymentColumns(actions: {
	onDelete: (paymentId: string) => void;
}): ColumnDef<Payment, unknown>[] {
	return [
		{
			accessorKey: "customer",
			header: "Customer",
			cell: ({ row }) => (
				<div className="font-medium">
					{displayName(
						row.original.customer.firstName,
						row.original.customer.lastName,
					)}
					{row.original.customer.username && (
						<span className="ml-1.5 text-xs text-muted-foreground">
							{row.original.customer.username}
						</span>
					)}
				</div>
			),
		},
		{
			accessorKey: "area",
			header: "Area",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{row.original.customer.groupName ?? "\u2014"}
				</span>
			),
		},
		{
			accessorKey: "paidAmount",
			header: "Amount",
			meta: { className: "text-right" },
			cell: ({ row }) => (
				<span className="text-right block font-semibold tabular-nums">
					{formatCurrency(row.original.paidAmount)}
				</span>
			),
		},
		{
			accessorKey: "stoppedAccount",
			header: "Status",
			cell: ({ row }) => (
				<Badge
					variant={getPaymentStatusVariant(
						row.original.stoppedAccount,
					)}
					className="text-xs"
				>
					{getPaymentStatusLabel(row.original.stoppedAccount)}
				</Badge>
			),
		},
		{
			accessorKey: "billingMonth",
			header: "Month",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{row.original.billingMonth
						? formatCycleLabel(row.original.billingMonth)
						: "\u2014"}
				</span>
			),
		},
		{
			accessorKey: "paidAt",
			header: "Paid",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{formatDate(row.original.paidAt)}
				</span>
			),
		},
		{
			accessorKey: "notes",
			header: "Note",
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
					<div className="max-w-[200px]">
						{category && (
							<Badge
								variant="outline"
								className="text-xs font-normal"
							>
								{NOTE_CATEGORY_LABELS[category] ?? category}
							</Badge>
						)}
						{notes && (
							<span className="block truncate text-xs text-muted-foreground mt-0.5">
								{notes}
							</span>
						)}
					</div>
				);
			},
		},
		{
			id: "actions",
			header: "",
			meta: { className: "w-20" },
			cell: ({ row }) => (
				<div className="flex items-center gap-0.5">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
							>
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem asChild>
								<a
									href={`/invoice/${row.original.id}`}
									target="_blank"
									rel="noopener noreferrer"
								>
									<ReceiptTextIcon className="mr-2 size-4" />
									View Invoice
								</a>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() =>
									actions.onDelete(row.original.id)
								}
							>
								<TrashIcon className="mr-2 size-4" />
								Delete Payment
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			),
		},
	];
}

const PAYMENTS_PER_PAGE = 25;

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive cash-collection feature file; private helper component of CashCollectionPage
function PaymentsTable({
	payments,
	total,
	page,
	onPageChange,
	isLoading,
	isFetching,
	collectorName,
}: {
	payments: Payment[];
	total: number;
	page: number;
	onPageChange: (page: number) => void;
	isLoading: boolean;
	isFetching: boolean;
	collectorName: string;
}) {
	const organizationId = useOrganizationId();
	const deletePayment = useDeletePayment();

	const columns = useMemo(
		() =>
			getPaymentColumns({
				onDelete: (paymentId) => {
					if (!organizationId) {
						return;
					}
					toast.promise(
						deletePayment.mutateAsync({
							organizationId,
							paymentId,
						}),
						{
							loading: "Deleting payment...",
							success: "Payment deleted",
							error: (err: { message?: string }) =>
								err?.message ?? "Failed to delete payment",
						},
					);
				},
			}),
		[organizationId, deletePayment],
	);

	const totalPages = Math.ceil(total / PAYMENTS_PER_PAGE);

	return (
		<div>
			<DataTable
				columns={columns}
				data={payments}
				isLoading={isLoading}
				isFetching={isFetching}
				emptyState={
					<Card>
						<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
							<ReceiptTextIcon className="size-10 text-muted-foreground/30" />
							<p className="text-sm text-muted-foreground">
								No payments found for {collectorName}.
							</p>
						</CardContent>
					</Card>
				}
			/>
			{totalPages > 1 && (
				<div className="flex flex-col gap-2 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm text-muted-foreground">
						{(page - 1) * PAYMENTS_PER_PAGE + 1}–
						{Math.min(page * PAYMENTS_PER_PAGE, total)} of {total}
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPageChange(page - 1)}
							disabled={page <= 1}
						>
							<ChevronLeftIcon className="size-4" />
						</Button>
						<span className="text-sm tabular-nums text-muted-foreground">
							{page} / {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPageChange(page + 1)}
							disabled={page >= totalPages}
						>
							<ChevronRightIcon className="size-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Handoff History Table ─────────────────────────────────────────

const COLLECTION_TYPE_LABELS: Record<string, string> = {
	HANDOFF: "Handoff",
	EXPENSE_DEDUCTION: "Expense",
	STOCK_RECEIVED: "Stock Received",
	INSTALLATION_COST: "Installation",
	DEALER_PAYMENT: "Dealer Payment",
	ADMIN_TRANSFER: "Transfer",
	NEW_USER_SETUP: "New User Setup",
	OTHER: "Other",
};

interface Collection {
	id: string;
	amount: number;
	type: string;
	notes: string | null;
	collectedAt: string | Date;
	collector: { name: string };
	receivedBy: { name: string } | null;
}

const HANDOFFS_PER_PAGE = 10;

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive cash-collection feature file; private helper component of CashCollectionPage
function HandoffsTable({
	collections,
	total,
	page,
	onPageChange,
	onDelete,
	sorting,
	onSortingChange,
}: {
	collections: Collection[];
	total: number;
	page: number;
	onPageChange: (page: number) => void;
	onDelete: (id: string) => void;
	sorting: SortingState;
	onSortingChange: (sorting: SortingState) => void;
}) {
	const columns: ColumnDef<Collection, unknown>[] = useMemo(
		() => [
			{
				id: "type",
				header: "Type",
				accessorFn: (row) => row.type,
				enableSorting: true,
				cell: ({ row }) => (
					<Badge variant="outline" className="text-xs font-normal">
						{COLLECTION_TYPE_LABELS[row.original.type] ??
							row.original.type}
					</Badge>
				),
			},
			{
				id: "amount",
				header: "Amount",
				accessorFn: (row) => row.amount,
				enableSorting: true,
				cell: ({ row }) => (
					<span
						className={`font-semibold tabular-nums ${row.original.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}
					>
						{formatCurrency(row.original.amount)}
					</span>
				),
			},
			{
				id: "collectedAt",
				header: "Date",
				accessorFn: (row) => row.collectedAt,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{formatDate(row.original.collectedAt)}
					</span>
				),
			},
			{
				id: "notes",
				header: "Note",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="max-w-[200px] truncate block text-muted-foreground">
						{row.original.notes ?? "\u2014"}
					</span>
				),
			},
			{
				id: "receivedBy",
				header: "Received By",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.receivedBy?.name ?? "\u2014"}
					</span>
				),
			},
			{
				id: "actions",
				header: "",
				meta: { className: "w-12" },
				cell: ({ row }) => (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8 text-destructive"
							>
								<TrashIcon className="size-3.5" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Delete handoff record?
								</AlertDialogTitle>
								<AlertDialogDescription>
									This will permanently delete the{" "}
									{formatCurrency(row.original.amount)}{" "}
									handoff record.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => onDelete(row.original.id)}
								>
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				),
			},
		],
		[onDelete],
	);

	return (
		<DataTable
			columns={columns}
			data={collections}
			sorting={sorting}
			onSortingChange={onSortingChange}
			emptyState={
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
						<HandCoinsIcon className="size-10 text-muted-foreground/30" />
						<p className="text-sm text-muted-foreground">
							No handoff records yet.
						</p>
					</CardContent>
				</Card>
			}
			pagination={
				total > HANDOFFS_PER_PAGE
					? {
							totalItems: total,
							currentPage: page,
							itemsPerPage: HANDOFFS_PER_PAGE,
							onPageChange,
						}
					: undefined
			}
		/>
	);
}

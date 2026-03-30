"use client";

import { PaymentStatus } from "@repo/database/enums";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
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
	CheckCircleIcon,
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
	useBulkProcessPayments,
	useCollections,
	useCollectorBalance,
	useCollectors,
	useCreateCollection,
	useCustomerGroups,
	useCycleFilter,
	useDeleteCollection,
	useDeletePayment,
	useProcessPayment,
} from "../hooks/use-billing";
import {
	formatCycleShort,
	getPaymentStatusVariant,
	NOTE_CATEGORY_LABELS,
	PAYMENT_STATUS_LABELS,
} from "../lib/billing-utils";
import { BillingCycleSelect } from "./BillingCycleSelect";

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

/** Non-suspense payments query for use inside this page */
function useCollectorPayments(filters: {
	collectorId: string | null;
	billingCycleId?: string;
	status?: PaymentStatus;
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
						billingCycleId: filters.billingCycleId,
						status: filters.status,
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
					filters.status ?? "all",
				]),
	);
}

export function CashCollectionPage() {
	const organizationId = useOrganizationId();
	const [selectedCollector, setSelectedCollector] = useState<string>("");
	const [page, setPage] = useState(1);
	const [tab, setTab] = useState<"payments" | "handoffs">("payments");

	// Payment filters
	const {
		cycleFilter,
		setCycleFilter,
		activeCycleId,
		options: cycleOptions,
	} = useCycleFilter();
	const [statusFilter, setStatusFilter] = useState<string>("PENDING");
	const [groupFilter, setGroupFilter] = useState<string>("");
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(timer);
	}, [search]);

	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];
	const { groups } = useCustomerGroups();

	// Resolve cycle date range for filtering handoff history
	const activeCycle = useMemo(() => {
		if (!activeCycleId) {
			return null;
		}
		return cycleOptions.find((c) => c.value === activeCycleId) ?? null;
	}, [activeCycleId, cycleOptions]);

	const cycleDateRange = useMemo(() => {
		if (!activeCycle) {
			return {};
		}
		const start = new Date(activeCycle.year, activeCycle.month - 1, 1);
		const end = new Date(activeCycle.year, activeCycle.month, 1);
		return {
			dateFrom: start.toISOString(),
			dateTo: end.toISOString(),
		};
	}, [activeCycle]);

	const { data: balanceData, isLoading: balanceLoading } =
		useCollectorBalance(selectedCollector || null, activeCycleId);

	const { data: collectionsData } = useCollections({
		collectorId: selectedCollector || undefined,
		...cycleDateRange,
		page: tab === "handoffs" ? page : 1,
	});

	const {
		data: paymentsData,
		isLoading: paymentsLoading,
		isFetching: paymentsFetching,
	} = useCollectorPayments({
		collectorId: selectedCollector || null,
		billingCycleId: activeCycleId,
		status: (statusFilter || undefined) as PaymentStatus | undefined,
		groupName: groupFilter || undefined,
		search: debouncedSearch || undefined,
		page,
		pageSize: 25,
	});

	const { data: pendingData } = useCollectorPayments({
		collectorId: selectedCollector || null,
		status: PaymentStatus.PENDING,
	});
	const pendingPayments = pendingData?.payments ?? [];

	const createCollection = useCreateCollection();
	const deleteCollection = useDeleteCollection();
	const processPayment = useProcessPayment();
	const bulkProcess = useBulkProcessPayments();

	const balance = balanceData?.balance ?? 0;

	const form = useForm({
		defaultValues: {
			amount: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId || !selectedCollector) {
				return;
			}
			toast.promise(
				createCollection.mutateAsync({
					organizationId,
					collectorId: selectedCollector,
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

	function handleProcessSingle(paymentId: string) {
		if (!organizationId) {
			return;
		}
		toast.promise(
			processPayment.mutateAsync({ organizationId, paymentId }),
			{
				loading: "Processing...",
				success: "Payment processed",
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to process",
			},
		);
	}

	function handleProcessAllPending() {
		if (!organizationId || pendingPayments.length === 0) {
			return;
		}
		const paymentIds = pendingPayments.map((p) => p.id);
		toast.promise(bulkProcess.mutateAsync({ organizationId, paymentIds }), {
			loading: `Processing ${paymentIds.length} payments...`,
			success: `${paymentIds.length} payments marked as processed`,
			error: (err: { message?: string }) =>
				err?.message ?? "Failed to process payments",
		});
	}

	const payments = paymentsData?.payments ?? [];

	const collectorName =
		collectors.find((c) => c.id === selectedCollector)?.name ?? "";

	return (
		<div className="space-y-6">
			{/* Header + Collector Selector */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Cash Collection
					</h2>
					<p className="text-sm text-muted-foreground">
						Track what collectors owe and record handoffs
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Select
						value={selectedCollector}
						onValueChange={(val) => {
							setSelectedCollector(val);
							setPage(1);
							setSearch("");
							setDebouncedSearch("");
							setStatusFilter("PENDING");
							setGroupFilter("");
						}}
					>
						<SelectTrigger className="w-full sm:w-64">
							<SelectValue placeholder="Select collector..." />
						</SelectTrigger>
						<SelectContent>
							{collectors.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<BillingCycleSelect
						value={cycleFilter || activeCycleId || "all"}
						onValueChange={(val) => {
							setCycleFilter(val);
							setPage(1);
						}}
						options={cycleOptions}
						allLabel="All cycles"
						className="w-full sm:w-40"
					/>
				</div>
			</div>

			{!selectedCollector ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-16 text-center">
						<HandCoinsIcon className="size-12 text-muted-foreground/30" />
						<p className="text-lg font-medium">
							Select a collector to get started
						</p>
						<p className="text-sm text-muted-foreground">
							View their balance, recent collections, and record
							cash handoffs.
						</p>
					</CardContent>
				</Card>
			) : (
				<>
					{/* In Hand Card */}
					<Card
						className={
							balance > 0
								? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
								: "border-muted"
						}
					>
						<CardContent className="p-4">
							<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
								<WalletIcon className="size-3.5 text-amber-600" />
								In Hand
							</div>
							{balanceLoading ? (
								<Skeleton className="mt-1 h-7 w-24" />
							) : (
								<p className="mt-1 text-2xl font-bold tabular-nums">
									{formatCurrency(balance)}
								</p>
							)}
							<p className="mt-0.5 text-xs text-muted-foreground">
								Cash with collector, not yet processed
							</p>
						</CardContent>
					</Card>

					{/* Pending Payments & Handoff — unified card */}
					<PendingPaymentsCard
						pendingPayments={pendingPayments}
						balance={balance}
						onProcessSingle={handleProcessSingle}
						onProcessAll={handleProcessAllPending}
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
									<div className="relative">
										<SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
										<Input
											placeholder="Search customer..."
											value={search}
											onChange={(e) => {
												setSearch(e.target.value);
												setPage(1);
											}}
											className="w-48 pl-8"
										/>
									</div>
									<Select
										value={statusFilter || "all"}
										onValueChange={(val) => {
											setStatusFilter(
												val === "all" ? "" : val,
											);
											setPage(1);
										}}
									>
										<SelectTrigger className="w-36">
											<SelectValue placeholder="Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												All statuses
											</SelectItem>
											<SelectItem
												value={PaymentStatus.PROCESSED}
											>
												Processed
											</SelectItem>
											<SelectItem
												value={PaymentStatus.PENDING}
											>
												Pending
											</SelectItem>
											<SelectItem
												value={PaymentStatus.STOPPED}
											>
												Stopped
											</SelectItem>
											<SelectItem
												value={PaymentStatus.PARTIAL}
											>
												Partial
											</SelectItem>
										</SelectContent>
									</Select>
									<Select
										value={groupFilter || "all"}
										onValueChange={(val) => {
											setGroupFilter(
												val === "all" ? "" : val,
											);
											setPage(1);
										}}
									>
										<SelectTrigger className="w-40">
											<SelectValue placeholder="Area" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												All areas
											</SelectItem>
											{groups.map((g) => (
												<SelectItem key={g} value={g}>
													{g}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
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
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
}

// ─── Pending Payments & Handoff Card ──────────────────────────────

const PENDING_PAGE_SIZE = 10;

interface PendingPayment {
	id: string;
	paidAmount: number;
	paidAt: string | Date;
	customer: {
		firstName: string | null;
		lastName: string | null;
		groupName: string | null;
	};
	billingCycle: { year: number; month: number } | null;
}

function PendingPaymentsCard({
	pendingPayments,
	balance,
	onProcessSingle,
	onProcessAll,
	handoffForm,
	isSubmittingHandoff,
	onCollectAll,
}: {
	pendingPayments: PendingPayment[];
	balance: number;
	onProcessSingle: (paymentId: string) => void;
	onProcessAll: () => void;
	// biome-ignore lint/suspicious/noExplicitAny: TanStack Form generic type is complex
	handoffForm: any;
	isSubmittingHandoff: boolean;
	onCollectAll: () => void;
}) {
	const [pendingSearch, setPendingSearch] = useState("");
	const [pendingPage, setPendingPage] = useState(1);

	function handlePendingSearch(value: string) {
		setPendingSearch(value);
		setPendingPage(1);
	}

	// Filter pending payments by search
	const filteredPending = useMemo(() => {
		if (!pendingSearch) {
			return pendingPayments;
		}
		const q = pendingSearch.toLowerCase();
		return pendingPayments.filter((p) => {
			const name = displayName(
				p.customer.firstName,
				p.customer.lastName,
			).toLowerCase();
			const group = (p.customer.groupName ?? "").toLowerCase();
			return name.includes(q) || group.includes(q);
		});
	}, [pendingPayments, pendingSearch]);

	// Paginate
	const totalPendingPages = Math.ceil(
		filteredPending.length / PENDING_PAGE_SIZE,
	);
	const paginatedPending = filteredPending.slice(
		(pendingPage - 1) * PENDING_PAGE_SIZE,
		pendingPage * PENDING_PAGE_SIZE,
	);

	const pendingTotal = pendingPayments.reduce(
		(sum, p) => sum + p.paidAmount,
		0,
	);
	const isEmpty = pendingPayments.length === 0;

	return (
		<Card className="border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 overflow-hidden">
			{/* Header */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-3">
				<div className="flex items-center gap-2">
					<div className="flex size-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
						<WalletIcon className="size-4 text-amber-600" />
					</div>
					<div>
						<h3 className="text-sm font-semibold">
							With Collector
						</h3>
						<p className="text-xs text-muted-foreground">
							{isEmpty
								? "No pending payments"
								: `${pendingPayments.length} payment${pendingPayments.length !== 1 ? "s" : ""} \u00b7 ${formatCurrency(pendingTotal)}`}
						</p>
					</div>
				</div>

				{!isEmpty && (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								size="sm"
								className="ml-auto gap-1.5 bg-green-600 text-white hover:bg-green-700"
							>
								<CheckCircleIcon className="size-3.5" />
								Process All
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Process all pending payments?
								</AlertDialogTitle>
								<AlertDialogDescription>
									This will mark {pendingPayments.length}{" "}
									payment
									{pendingPayments.length !== 1 ? "s" : ""}{" "}
									totalling {formatCurrency(pendingTotal)} as
									processed.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction onClick={onProcessAll}>
									Process All
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				)}
			</div>

			{/* Search — only show when there are enough payments */}
			{pendingPayments.length > 5 && (
				<div className="px-4 pb-3">
					<div className="relative">
						<SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
						<Input
							placeholder="Search pending payments..."
							value={pendingSearch}
							onChange={(e) =>
								handlePendingSearch(e.target.value)
							}
							className="h-8 pl-8 text-sm bg-background/60"
						/>
					</div>
				</div>
			)}

			{/* Payment rows */}
			{!isEmpty && (
				<div className="px-4 pb-3">
					<div className="space-y-1.5">
						{paginatedPending.map((p) => (
							<div
								key={p.id}
								className="group flex items-center justify-between rounded-lg bg-background/80 px-3 py-2.5 text-sm border border-amber-200/40 dark:border-amber-900/30 transition-colors hover:bg-background"
							>
								<div className="min-w-0">
									<span className="font-medium">
										{displayName(
											p.customer.firstName,
											p.customer.lastName,
										)}
									</span>
									{p.customer.groupName && (
										<span className="ml-1.5 text-xs text-muted-foreground">
											{p.customer.groupName}
										</span>
									)}
									<div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
										{p.billingCycle && (
											<span>
												{formatCycleLabel(
													p.billingCycle,
												)}
											</span>
										)}
										<span>
											{new Date(
												p.paidAt,
											).toLocaleDateString()}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-1 shrink-0 ml-3">
									<span className="font-semibold tabular-nums mr-1">
										{formatCurrency(p.paidAmount)}
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="size-7 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
										onClick={() => onProcessSingle(p.id)}
										title="Mark as processed"
									>
										<CheckCircleIcon className="size-3.5" />
									</Button>
									<a
										href={`/invoice/${p.id}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
									>
										<ReceiptTextIcon className="size-3.5" />
									</a>
								</div>
							</div>
						))}
					</div>

					{/* Pagination */}
					{totalPendingPages > 1 && (
						<div className="flex items-center justify-between pt-2 mt-1">
							<p className="text-xs text-muted-foreground">
								{(pendingPage - 1) * PENDING_PAGE_SIZE + 1}–
								{Math.min(
									pendingPage * PENDING_PAGE_SIZE,
									filteredPending.length,
								)}{" "}
								of {filteredPending.length}
							</p>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									disabled={pendingPage <= 1}
									onClick={() => setPendingPage((p) => p - 1)}
								>
									<ChevronLeftIcon className="size-3.5" />
								</Button>
								<span className="text-xs tabular-nums text-muted-foreground px-1">
									{pendingPage}/{totalPendingPages}
								</span>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									disabled={pendingPage >= totalPendingPages}
									onClick={() => setPendingPage((p) => p + 1)}
								>
									<ChevronRightIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Empty state */}
			{isEmpty && (
				<div className="flex flex-col items-center gap-1.5 px-4 pb-5 text-center">
					<CheckCircleIcon className="size-8 text-green-500/40" />
					<p className="text-sm font-medium text-muted-foreground">
						All caught up
					</p>
					<p className="text-xs text-muted-foreground">
						No pending payments with this collector.
					</p>
				</div>
			)}

			{/* Handoff form — integrated as card footer */}
			<div className="border-t border-amber-200/40 dark:border-amber-900/30 bg-background/40 px-4 py-3">
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
	status: PaymentStatus;
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
	billingCycle: { year: number; month: number } | null;
}

function getPaymentColumns(actions: {
	onProcess: (paymentId: string) => void;
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
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge
					variant={getPaymentStatusVariant(row.original.status)}
					className={
						row.original.status === PaymentStatus.PENDING
							? "text-xs border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
							: "text-xs"
					}
				>
					{PAYMENT_STATUS_LABELS[row.original.status] ??
						row.original.status}
				</Badge>
			),
		},
		{
			accessorKey: "billingCycle",
			header: "Month",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{row.original.billingCycle
						? formatCycleLabel(row.original.billingCycle)
						: "\u2014"}
				</span>
			),
		},
		{
			accessorKey: "paidAt",
			header: "Paid",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{new Date(row.original.paidAt).toLocaleDateString()}
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
					{row.original.status === PaymentStatus.PENDING && (
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-green-600 hover:text-green-700"
							onClick={() => actions.onProcess(row.original.id)}
							title="Mark as processed"
						>
							<CheckCircleIcon className="size-4" />
						</Button>
					)}
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
							{row.original.status === PaymentStatus.PENDING && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() =>
											actions.onProcess(row.original.id)
										}
									>
										<CheckCircleIcon className="mr-2 size-4 text-green-600" />
										Mark as Processed
									</DropdownMenuItem>
								</>
							)}
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
	const processPayment = useProcessPayment();
	const deletePayment = useDeletePayment();

	const columns = useMemo(
		() =>
			getPaymentColumns({
				onProcess: (paymentId) => {
					if (!organizationId) {
						return;
					}
					toast.promise(
						processPayment.mutateAsync({
							organizationId,
							paymentId,
						}),
						{
							loading: "Processing payment...",
							success: "Payment marked as processed",
							error: (err: { message?: string }) =>
								err?.message ?? "Failed to process payment",
						},
					);
				},
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
		[organizationId, processPayment, deletePayment],
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
				<div className="flex items-center justify-between px-1 pt-4">
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

interface Collection {
	id: string;
	amount: number;
	notes: string | null;
	collectedAt: string | Date;
	collector: { name: string };
	receivedBy: { name: string } | null;
}

const HANDOFFS_PER_PAGE = 10;

function HandoffsTable({
	collections,
	total,
	page,
	onPageChange,
	onDelete,
}: {
	collections: Collection[];
	total: number;
	page: number;
	onPageChange: (page: number) => void;
	onDelete: (id: string) => void;
}) {
	const columns: ColumnDef<Collection, unknown>[] = useMemo(
		() => [
			{
				accessorKey: "amount",
				header: "Amount",
				cell: ({ row }) => (
					<span className="font-semibold tabular-nums">
						{formatCurrency(row.original.amount)}
					</span>
				),
			},
			{
				accessorKey: "collectedAt",
				header: "Date",
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{new Date(
							row.original.collectedAt,
						).toLocaleDateString()}
					</span>
				),
			},
			{
				accessorKey: "notes",
				header: "Note",
				cell: ({ row }) => (
					<span className="max-w-[200px] truncate block text-muted-foreground">
						{row.original.notes ?? "\u2014"}
					</span>
				),
			},
			{
				id: "receivedBy",
				header: "Received By",
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

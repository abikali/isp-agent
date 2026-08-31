"use client";

import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { formatCurrency, formatDateTime } from "@shared/lib/format";
import { buildMonthOptions, monthRange } from "@shared/lib/month-filter";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import {
	AlertTriangleIcon,
	CameraOffIcon,
	CheckIcon,
	CoinsIcon,
	ImageIcon,
	LayersIcon,
	ReceiptIcon,
	UsersIcon,
	XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type ExpenseStatus,
	useApproveExpense,
	useExpenseFilterOptions,
	useExpenseSummary,
	useExpenses,
	useRejectExpense,
} from "../hooks/use-expenses";

type Expense = ReturnType<typeof useExpenses>["expenses"][number];

const PAGE_SIZE = 25;

const SORT_BY_MAP = {
	createdAt: "createdAt",
	amount: "amount",
	status: "status",
} as const;

const STATUS_BADGES: Record<
	ExpenseStatus,
	{ label: string; variant: "info" | "success" | "error" }
> = {
	PENDING: { label: "Pending", variant: "info" },
	APPROVED: { label: "Approved", variant: "success" },
	REJECTED: { label: "Rejected", variant: "error" },
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive expenses review page: filters, approval/reject dialog, and table column defs share local state; splitting would scatter tightly-coupled state
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/dialog state slices (status, employee, month, page, ...) read clearer as separate useState than a reducer
export function ExpensesList() {
	const organizationId = useOrganizationId();

	const [status, setStatus] = useState<ExpenseStatus>("PENDING");
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [employeeId, setEmployeeId] = useState<string | undefined>();
	const [bucketId, setBucketId] = useState<string | undefined>();
	const [category, setCategory] = useState<string | undefined>();
	const [receiptFilter, setReceiptFilter] = useState<"all" | "yes" | "no">(
		"all",
	);
	const [monthFilter, setMonthFilter] = useState<string>("all");
	const [page, setPage] = useState(1);

	const resetPage = () => setPage(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		resetPage,
	);

	const monthOptions = useMemo(() => buildMonthOptions(), []);

	const filters = {
		status,
		...(debouncedSearch ? { search: debouncedSearch } : {}),
		...(employeeId ? { employeeId } : {}),
		...(bucketId ? { financeCategoryId: bucketId } : {}),
		...(category ? { category } : {}),
		...(receiptFilter !== "all"
			? { hasReceipt: receiptFilter === "yes" }
			: {}),
		...monthRange(monthFilter),
	};

	const { workers, categories, buckets } = useExpenseFilterOptions(status);
	const workerOptions = useMemo(
		() => [
			{ value: "all", label: "All workers" },
			...workers.map((w) => ({
				value: w.id,
				label: `${w.name} (${w.count})`,
			})),
		],
		[workers],
	);
	const { summary } = useExpenseSummary(filters);
	const { expenses, total, isLoading, isFetching, error } = useExpenses({
		...filters,
		page,
		pageSize: PAGE_SIZE,
		...(sortBy ? { sortBy } : {}),
		...(sortOrder ? { sortOrder } : {}),
	});

	const activeFilterCount = [
		debouncedSearch,
		employeeId,
		bucketId,
		category,
		receiptFilter !== "all" ? receiptFilter : undefined,
		monthFilter !== "all" ? monthFilter : undefined,
	].filter(Boolean).length;

	const resetFilters = () => {
		setSearch("");
		setEmployeeId(undefined);
		setBucketId(undefined);
		setCategory(undefined);
		setReceiptFilter("all");
		setMonthFilter("all");
		resetPage();
	};

	const approveExpense = useApproveExpense();
	const rejectExpense = useRejectExpense();

	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<Expense | null>(null);
	const [rejectReason, setRejectReason] = useState("");

	const columns = useMemo<ColumnDef<Expense, unknown>[]>(
		() => [
			{
				accessorKey: "createdAt",
				header: "Date",
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-sm tabular-nums">
						{formatDateTime(row.original.createdAt, {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</span>
				),
			},
			{
				id: "worker",
				header: "Worker",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-sm font-medium">
						{row.original.submittedBy.name}
					</span>
				),
			},
			{
				accessorKey: "amount",
				header: "Amount",
				cell: ({ row }) => (
					<span className="font-mono text-sm font-medium tabular-nums">
						{formatCurrency(row.original.amount)}
					</span>
				),
			},
			{
				id: "description",
				header: "Description",
				enableSorting: false,
				cell: ({ row }) => (
					<div>
						{row.original.category && (
							<Badge variant="outline" className="mr-2">
								{row.original.category}
							</Badge>
						)}
						<span className="text-sm text-muted-foreground">
							{row.original.description}
						</span>
						{row.original.status === "REJECTED" &&
							row.original.rejectedReason && (
								<p className="mt-0.5 text-xs text-destructive">
									Reason: {row.original.rejectedReason}
								</p>
							)}
					</div>
				),
			},
			{
				id: "bucket",
				header: "Bucket",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.financeCategory ? (
						<Badge variant="secondary" className="font-normal">
							{row.original.financeCategory.label}
						</Badge>
					) : (
						<span className="text-xs text-muted-foreground">
							Uncategorised
						</span>
					),
			},
			{
				id: "receipt",
				header: "Receipt",
				enableSorting: false,
				cell: ({ row }) =>
					row.original.receiptUrl ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setReceiptUrl(row.original.receiptUrl)
							}
						>
							<ImageIcon className="mr-1.5 size-3.5" />
							View
						</Button>
					) : (
						<span className="text-xs text-muted-foreground">
							No photo
						</span>
					),
			},
			{
				accessorKey: "status",
				header: "Status",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => {
					const cfg =
						STATUS_BADGES[row.original.status as ExpenseStatus];
					return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
				},
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => {
					const expense = row.original;
					if (expense.status !== "PENDING") {
						return expense.approvedBy ? (
							<span className="text-xs text-muted-foreground">
								by {expense.approvedBy.name}
							</span>
						) : null;
					}
					return (
						<PermissionGate resource="expenses" action="approve">
							<div className="flex gap-1.5">
								<Button
									size="sm"
									disabled={approveExpense.isPending}
									onClick={async () => {
										if (!organizationId) {
											return;
										}
										try {
											await approveExpense.mutateAsync({
												organizationId,
												id: expense.id,
											});
											toast.success("Expense approved");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to approve",
											);
										}
									}}
								>
									<CheckIcon className="mr-1 size-3.5" />
									Approve
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setRejectReason("");
										setRejecting(expense);
									}}
								>
									<XIcon className="mr-1 size-3.5" />
									Reject
								</Button>
							</div>
						</PermissionGate>
					);
				},
			},
		],
		[organizationId, approveExpense],
	);

	return (
		<PageShell
			title="Expenses"
			description="Review worker expense claims — approve to deduct from their cash balance."
		>
			<Tabs
				value={status}
				onValueChange={(v) => {
					setStatus(v as ExpenseStatus);
					// The worker/bucket/type choices are derived per tab; a pick
					// from the old tab may not exist in the new one.
					setEmployeeId(undefined);
					setBucketId(undefined);
					setCategory(undefined);
					resetPage();
				}}
			>
				<TabsList>
					<TabsTrigger value="PENDING">Pending</TabsTrigger>
					<TabsTrigger value="APPROVED">Approved</TabsTrigger>
					<TabsTrigger value="REJECTED">Rejected</TabsTrigger>
				</TabsList>
			</Tabs>

			<StatCardGroup columns={5}>
				<StatCard
					title="Total"
					icon={CoinsIcon}
					value={formatCurrency(summary?.totalAmount ?? 0)}
					color={status === "APPROVED" ? "emerald" : "blue"}
					description={`${(summary?.count ?? 0).toLocaleString()} claims`}
				/>
				<StatCard
					title="Workers"
					icon={UsersIcon}
					value={summary?.workerCount ?? 0}
					description="submitted"
				/>
				<StatCard
					title="Average claim"
					value={formatCurrency(summary?.averageAmount ?? 0)}
					description={`largest ${formatCurrency(summary?.largestAmount ?? 0)}`}
				/>
				<StatCard
					title={summary?.topBucket?.label ?? "Top bucket"}
					icon={LayersIcon}
					value={formatCurrency(summary?.topBucket?.amount ?? 0)}
					color="purple"
					description={`${summary?.topBucket?.count ?? 0} claims · biggest bucket`}
				/>
				<StatCard
					title="No receipt"
					icon={CameraOffIcon}
					value={summary?.missingReceipt ?? 0}
					color={summary?.missingReceipt ? "amber" : "default"}
					description="claims without a photo"
					active={receiptFilter === "no"}
					onClick={() => {
						setReceiptFilter(receiptFilter === "no" ? "all" : "no");
						resetPage();
					}}
				/>
			</StatCardGroup>

			<ContentCard>
				<ContentCardToolbar>
					<FilterBar
						bare
						searchPlaceholder="Search description, category or worker…"
						searchValue={search}
						onSearchChange={(v) => {
							setSearch(v);
							resetPage();
						}}
						activeFilterCount={activeFilterCount}
						onReset={resetFilters}
					>
						<Select
							value={monthFilter}
							onValueChange={(v) => {
								setMonthFilter(v);
								resetPage();
							}}
						>
							<SelectTrigger className="w-40 shrink-0">
								<SelectValue placeholder="All time" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All time</SelectItem>
								{monthOptions.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Combobox
							options={workerOptions}
							value={employeeId ?? "all"}
							onChange={(v) => {
								setEmployeeId(v === "all" ? undefined : v);
								resetPage();
							}}
							searchPlaceholder="Search workers…"
							emptyText="No workers found"
							className="w-40 shrink-0"
						/>

						<Select
							value={bucketId ?? "all"}
							onValueChange={(v) => {
								setBucketId(v === "all" ? undefined : v);
								resetPage();
							}}
						>
							<SelectTrigger className="w-40 shrink-0">
								<SelectValue placeholder="All buckets" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All buckets</SelectItem>
								{buckets.map((b) => (
									<SelectItem key={b.id} value={b.id}>
										{b.label} ({b.count})
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{categories.length > 0 && (
							<Select
								value={category ?? "all"}
								onValueChange={(v) => {
									setCategory(v === "all" ? undefined : v);
									resetPage();
								}}
							>
								<SelectTrigger className="w-36 shrink-0">
									<SelectValue placeholder="All types" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All types
									</SelectItem>
									{categories.map((c) => (
										<SelectItem
											key={c.value}
											value={c.value}
										>
											{c.value} ({c.count})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						<Select
							value={receiptFilter}
							onValueChange={(v) => {
								setReceiptFilter(v as "all" | "yes" | "no");
								resetPage();
							}}
						>
							<SelectTrigger className="w-36 shrink-0">
								<SelectValue placeholder="Any receipt" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Any receipt</SelectItem>
								<SelectItem value="yes">With photo</SelectItem>
								<SelectItem value="no">No photo</SelectItem>
							</SelectContent>
						</Select>
					</FilterBar>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={expenses}
					isLoading={isLoading}
					isFetching={isFetching}
					sorting={sorting}
					onSortingChange={onSortingChange}
					columnVisibilityKey="expenses-list"
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					emptyState={
						error ? (
							<EmptyState
								icon={AlertTriangleIcon}
								title="Couldn't load expenses"
								description={error.message}
							/>
						) : (
							<EmptyState
								icon={ReceiptIcon}
								title={`No ${status.toLowerCase()} expenses`}
								description={
									activeFilterCount > 0
										? "No claims match these filters."
										: "Worker expense claims will appear here."
								}
							/>
						)
					}
				/>
			</ContentCard>

			{receiptUrl && (
				<ImageViewerDialog
					open={!!receiptUrl}
					onOpenChange={(open) => {
						if (!open) {
							setReceiptUrl(null);
						}
					}}
					src={receiptUrl}
					title="Receipt"
				/>
			)}

			{rejecting && (
				<Dialog
					open={!!rejecting}
					onOpenChange={(open) => {
						if (!open) {
							setRejecting(null);
						}
					}}
				>
					<DialogContent className="sm:max-w-sm">
						<DialogHeader>
							<DialogTitle>Reject Expense</DialogTitle>
						</DialogHeader>
						<p className="text-sm text-muted-foreground">
							Rejecting {rejecting.submittedBy.name}'s{" "}
							{formatCurrency(rejecting.amount)} expense.
						</p>
						<Textarea
							value={rejectReason}
							onChange={(e) => setRejectReason(e.target.value)}
							placeholder="Reason (optional)"
							rows={3}
						/>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setRejecting(null)}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={rejectExpense.isPending}
								onClick={async () => {
									if (!organizationId) {
										return;
									}
									try {
										await rejectExpense.mutateAsync({
											organizationId,
											id: rejecting.id,
											reason: rejectReason || undefined,
										});
										toast.success("Expense rejected");
										setRejecting(null);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to reject",
										);
									}
								}}
							>
								Reject
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</PageShell>
	);
}

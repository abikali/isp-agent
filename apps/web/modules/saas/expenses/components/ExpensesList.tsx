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
	CheckIcon,
	ImageIcon,
	ReceiptIcon,
	RepeatIcon,
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
import {
	useFinanceCategories,
	useSetExpenseBucket,
} from "../hooks/use-spending";

type Expense = ReturnType<typeof useExpenses>["expenses"][number];
type Source = "all" | "claims" | "direct";

/** A pending claim about to be rejected — enough to write the dialog. */
export interface RejectTarget {
	id: string;
	amount: number;
	who: string;
}

/** What the page's tiles ask the table to start on. */
export type ExpensesPreset = "all" | "pending" | "unclassified";

interface ExpensesListProps {
	/** Render without a PageShell — the Spending page provides the frame. */
	embedded?: boolean;
	/** Starting tab + filters; remount with `key` to apply a new one. */
	preset?: ExpensesPreset;
	/** Controlled reject dialog, so the attention strip can open it too. */
	rejecting?: RejectTarget | null;
	onRejectingChange?: (target: RejectTarget | null) => void;
}

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
export function ExpensesList({
	embedded = false,
	preset = "pending",
	rejecting: rejectingProp,
	onRejectingChange,
}: ExpensesListProps) {
	const organizationId = useOrganizationId();

	const [status, setStatus] = useState<ExpenseStatus>(
		preset === "pending" ? "PENDING" : "APPROVED",
	);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [employeeId, setEmployeeId] = useState<string | undefined>();
	const [bucketId, setBucketId] = useState<string | undefined>(
		preset === "unclassified" ? "none" : undefined,
	);
	const [source, setSource] = useState<Source>("all");
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
		...(source !== "all" ? { source } : {}),
		...(category ? { category } : {}),
		...(receiptFilter !== "all"
			? { hasReceipt: receiptFilter === "yes" }
			: {}),
		...monthRange(monthFilter),
	};

	const { workers, categories, buckets } = useExpenseFilterOptions(status);
	const { categories: allBuckets } = useFinanceCategories();
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
		source !== "all" ? source : undefined,
		category,
		receiptFilter !== "all" ? receiptFilter : undefined,
		monthFilter !== "all" ? monthFilter : undefined,
	].filter(Boolean).length;

	const resetFilters = () => {
		setSearch("");
		setEmployeeId(undefined);
		setBucketId(undefined);
		setSource("all");
		setCategory(undefined);
		setReceiptFilter("all");
		setMonthFilter("all");
		resetPage();
	};

	const approveExpense = useApproveExpense();
	const rejectExpense = useRejectExpense();
	const setBucket = useSetExpenseBucket();

	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
	const [rejectingLocal, setRejectingLocal] = useState<RejectTarget | null>(
		null,
	);
	const rejecting = rejectingProp ?? rejectingLocal;
	const setRejecting = onRejectingChange ?? setRejectingLocal;
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
				id: "who",
				header: "Who",
				enableSorting: false,
				cell: ({ row }) => {
					const e = row.original;
					if (e.submittedBy) {
						return (
							<span className="text-sm font-medium">
								{e.submittedBy.name}
							</span>
						);
					}
					return (
						<div className="text-sm">
							<span className="font-medium">
								{e.createdBy?.name ?? "Company"}
							</span>
							<div className="flex items-center gap-1 text-xs text-muted-foreground">
								{e.recurring ? (
									<>
										<RepeatIcon className="size-3" />
										every month
									</>
								) : (
									"entered directly"
								)}
							</div>
						</div>
					);
				},
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
				cell: ({ row }) => {
					const e = row.original;
					return (
						<PermissionGate
							resource="expenses"
							action="approve"
							fallback={
								e.financeCategory ? (
									<Badge
										variant="secondary"
										className="font-normal"
									>
										{e.financeCategory.label}
									</Badge>
								) : (
									<span className="text-xs text-muted-foreground">
										Needs a bucket
									</span>
								)
							}
						>
							<Combobox
								className={
									e.financeCategory
										? "h-8 w-44 text-xs"
										: "h-8 w-44 border-warning/60 text-xs"
								}
								value={e.financeCategory?.id ?? ""}
								onChange={async (v) => {
									if (!organizationId) {
										return;
									}
									try {
										await setBucket.mutateAsync({
											organizationId,
											id: e.id,
											financeCategoryId: v || null,
										});
									} catch (err) {
										toast.error(
											err instanceof Error
												? err.message
												: "Could not move it",
										);
									}
								}}
								options={[
									{ value: "", label: "Needs a bucket" },
									...allBuckets.map((c) => ({
										value: c.id,
										label: c.label,
									})),
								]}
								placeholder="Needs a bucket"
								searchPlaceholder="Search buckets…"
								emptyText="No bucket matches"
							/>
						</PermissionGate>
					);
				},
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
						return expense.approvedBy && expense.submittedBy ? (
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
										setRejecting({
											id: expense.id,
											amount: expense.amount,
											who:
												expense.submittedBy?.name ??
												"this",
										});
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
		[organizationId, approveExpense, setBucket, allBuckets, setRejecting],
	);

	const content = (
		<>
			<ContentCard>
				<ContentCardToolbar
					actions={
						<span className="text-xs text-muted-foreground tabular-nums">
							{(summary?.count ?? total).toLocaleString()}{" "}
							{(summary?.count ?? total) === 1 ? "line" : "lines"}{" "}
							· {formatCurrency(summary?.totalAmount ?? 0)}
						</span>
					}
				>
					<Tabs
						value={status}
						onValueChange={(v) => {
							setStatus(v as ExpenseStatus);
							// The worker/bucket/type choices are derived per tab; a
							// pick from the old tab may not exist in the new one.
							setEmployeeId(undefined);
							setBucketId(undefined);
							setCategory(undefined);
							resetPage();
						}}
					>
						<TabsList>
							<TabsTrigger value="APPROVED">Approved</TabsTrigger>
							<TabsTrigger value="PENDING">Pending</TabsTrigger>
							<TabsTrigger value="REJECTED">Rejected</TabsTrigger>
						</TabsList>
					</Tabs>
				</ContentCardToolbar>
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

						<Select
							value={source}
							onValueChange={(v) => {
								setSource(v as Source);
								resetPage();
							}}
						>
							<SelectTrigger className="w-40 shrink-0">
								<SelectValue placeholder="All sources" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All sources</SelectItem>
								<SelectItem value="claims">
									Worker claims
								</SelectItem>
								<SelectItem value="direct">
									Entered directly
								</SelectItem>
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
										? "No lines match these filters."
										: status === "PENDING"
											? "Worker claims land here when they are submitted."
											: "Approved spending and worker claims appear here."
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
							Rejecting {rejecting.who}'s{" "}
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
		</>
	);

	if (embedded) {
		return content;
	}
	return (
		<PageShell
			title="Expenses"
			description="Worker expense claims and company spending."
		>
			{content}
		</PageShell>
	);
}

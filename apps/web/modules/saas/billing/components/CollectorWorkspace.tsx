"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import {
	ContentCard,
	ContentCardSection,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate, formatDateTime } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { cn } from "@ui/lib";
import {
	BanknoteIcon,
	HandCoinsIcon,
	HashIcon,
	MoreHorizontalIcon,
	PhoneIcon,
	ReceiptTextIcon,
	TrashIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useCollectorBalance,
	useCustomerGroups,
	useDeleteCollection,
	useDeletePayment,
	useMonthFilter,
	usePaymentsQuery,
} from "../hooks/use-billing";
import {
	formatCycleShort,
	getPaymentStatusLabel,
	getPaymentStatusVariant,
	NOTE_CATEGORY_LABELS,
} from "../lib/billing-utils";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { GroupSelect } from "./BillingFilters";
import { GiveMoneyCard } from "./GiveMoneyCard";

const HANDOFF_SORT_BY_MAP = {
	collectedAt: "collectedAt",
	amount: "amount",
	type: "type",
} as const satisfies Record<string, "collectedAt" | "amount" | "type">;

const PAGE_SIZE = 25;

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase();
}

interface CollectorWorkspaceProps {
	collectorId: string;
	collectorName: string;
	collectorUsername: string | null;
	collectorPhone: string | null;
	customerCount: number;
	pendingStoppedCount: number;
	backTo: string;
}

export function CollectorWorkspace({
	collectorId,
	collectorName,
	collectorUsername,
	collectorPhone,
	customerCount,
	pendingStoppedCount,
	backTo,
}: CollectorWorkspaceProps) {
	const organizationId = useOrganizationId();
	const { activeOrganization } = useActiveOrganization();
	const orgSlug = activeOrganization?.slug ?? "";

	const { data: balanceData, isLoading: balanceLoading } =
		useCollectorBalance(collectorId);
	const balance = balanceData?.balance ?? 0;

	const collectionRate =
		balanceData && balanceData.monthBillCount > 0
			? Math.round(
					(balanceData.monthPaidCount / balanceData.monthBillCount) *
						100,
				)
			: 0;
	const monthBillCount = balanceData?.monthBillCount ?? 0;
	const monthPaidCount = balanceData?.monthPaidCount ?? 0;
	const monthAmountCollected = balanceData?.monthAmountCollected ?? 0;
	const monthAmountDue = balanceData?.monthAmountDue ?? 0;
	const unpaidCount = Math.max(0, monthBillCount - monthPaidCount);
	const remaining = Math.max(0, monthAmountDue - monthAmountCollected);
	const billsHint =
		monthBillCount === 0
			? "No bills this cycle"
			: unpaidCount === 0
				? "All collected this cycle"
				: `${collectionRate}% settled • ${unpaidCount} to go`;
	const remainingHint =
		monthBillCount === 0
			? "Nothing billed yet"
			: unpaidCount === 0
				? "All bills collected"
				: `${unpaidCount} bills still to collect`;

	const badges = useMemo(
		() =>
			pendingStoppedCount > 0 ? (
				<Badge
					variant="outline"
					className="border-warning/40 bg-warning/10 text-warning"
				>
					{pendingStoppedCount} need review
				</Badge>
			) : null,
		[pendingStoppedCount],
	);

	return (
		<PageShell
			title={collectorName}
			backTo={backTo}
			backLabel="Collectors"
			badges={badges}
			subtitle={
				<div className="flex flex-wrap items-center gap-1.5 text-xs">
					<Avatar className="size-5">
						<AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
							{getInitials(collectorName)}
						</AvatarFallback>
					</Avatar>
					{collectorUsername && (
						<span className="font-medium tabular-nums text-muted-foreground">
							@{collectorUsername}
						</span>
					)}
					<span className="opacity-30">·</span>
					<span className="tabular-nums text-muted-foreground">
						{customerCount} customers
					</span>
					{collectorPhone && (
						<>
							<span className="opacity-30">·</span>
							<a
								href={`tel:${collectorPhone}`}
								className="inline-flex items-center gap-1 tabular-nums text-muted-foreground hover:text-foreground"
							>
								<PhoneIcon className="size-3" />
								{collectorPhone}
							</a>
						</>
					)}
				</div>
			}
		>
			<MetricStrip columns={4}>
				{balanceLoading ? (
					<>
						<MetricCardSkeleton />
						<MetricCardSkeleton />
						<MetricCardSkeleton />
						<MetricCardSkeleton />
					</>
				) : (
					<>
						<MetricCard
							label="In hand"
							value={formatCurrency(balance)}
							icon={WalletIcon}
							tone={balance > 0 ? "warning" : "default"}
							hint="Cash on you to hand off"
						/>
						<MetricCard
							label="Collected"
							value={formatCurrency(monthAmountCollected)}
							icon={BanknoteIcon}
							tone="success"
							hint="This cycle"
						/>
						<MetricCard
							label="Bills"
							value={`${monthPaidCount} / ${monthBillCount}`}
							icon={HashIcon}
							tone={
								collectionRate >= 80
									? "success"
									: collectionRate >= 40
										? "warning"
										: "info"
							}
							hint={billsHint}
						/>
						<MetricCard
							label="Remaining"
							value={formatCurrency(remaining)}
							icon={HandCoinsIcon}
							tone={remaining > 0 ? "danger" : "default"}
							hint={remainingHint}
						/>
					</>
				)}
			</MetricStrip>

			<HandoffCard
				collectorId={collectorId}
				balance={balance}
				orgSlug={orgSlug}
			/>

			<GiveMoneyCard employeeId={collectorId} balance={balance} />

			<Tabs defaultValue="payments" className="space-y-3">
				<TabsList className="w-full justify-start sm:w-auto">
					<TabsTrigger value="payments" className="gap-1.5">
						<ReceiptTextIcon className="size-3.5" />
						Payments
					</TabsTrigger>
					<TabsTrigger value="handoffs" className="gap-1.5">
						<HandCoinsIcon className="size-3.5" />
						Handoff history
					</TabsTrigger>
				</TabsList>

				<TabsContent value="payments">
					<PaymentsPanel
						collectorId={collectorId}
						collectorName={collectorName}
						orgSlug={orgSlug}
						organizationId={organizationId}
					/>
				</TabsContent>

				<TabsContent value="handoffs">
					<HandoffsPanel
						collectorId={collectorId}
						organizationId={organizationId}
					/>
				</TabsContent>
			</Tabs>
		</PageShell>
	);
}

// ─── Handoff form ────────────────────────────────────────────────────

function HandoffCard({
	collectorId,
	balance,
	orgSlug,
}: {
	collectorId: string;
	balance: number;
	orgSlug: string;
}) {
	const organizationId = useOrganizationId();
	const createCollection = useCollectorCreate();
	const hasBalance = balance > 0;

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
					loading: "Recording handoff…",
					success: () => {
						form.reset();
						return "Handoff recorded";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to record handoff",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<ContentCard
			className={cn(
				"transition-colors",
				hasBalance &&
					"border-warning/40 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--warning)_12%,transparent),transparent_70%)]",
			)}
		>
			<ContentCardSection padded={false} className="border-b-0">
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- client-side TanStack Form submitting via oRPC mutation; no server action exists, preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-4"
				>
					<HandCoinsIcon
						className={cn(
							"size-4 shrink-0",
							hasBalance
								? "text-warning"
								: "text-muted-foreground",
						)}
					/>
					<form.Field name="amount">
						{(field) => (
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
									className="h-8 w-28 text-sm tabular-nums"
									required
								/>
								{hasBalance && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 shrink-0 text-xs"
										onClick={() =>
											field.handleChange(String(balance))
										}
									>
										All · {formatCurrency(balance)}
									</Button>
								)}
							</div>
						)}
					</form.Field>
					<form.Field name="notes">
						{(field) => (
							<Input
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value)
								}
								placeholder="Note (optional)"
								className="h-8 min-w-[140px] flex-1 text-sm"
							/>
						)}
					</form.Field>
					<Button
						type="submit"
						size="sm"
						className="h-8 shrink-0"
						disabled={isSubmitting}
					>
						<BanknoteIcon className="mr-1.5 size-3.5" />
						{isSubmitting ? "Recording…" : "Record handoff"}
					</Button>
					{orgSlug && (
						<a
							href={`/app/${orgSlug}/billing/payments`}
							className="ml-auto hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
						>
							View all payments →
						</a>
					)}
				</form>
			</ContentCardSection>
		</ContentCard>
	);
}

// ─── Payments panel ──────────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive collector payments panel; sections share filter/pagination/mutation state and splitting would scatter tightly-coupled logic
function PaymentsPanel({
	collectorId,
	collectorName,
	orgSlug,
	organizationId,
}: {
	collectorId: string;
	collectorName: string;
	orgSlug: string;
	organizationId: string | null;
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- these are independent UI slices (page, status/group filters, search); a reducer would not group them meaningfully
}) {
	const [page, setPage] = useState(1);
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [groupFilter, setGroupFilter] = useState<string>("");
	const [search, setSearch] = useState("");
	const { groups } = useCustomerGroups();
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		options: monthOptions,
	} = useMonthFilter();

	const stoppedAccount =
		statusFilter === "stopped"
			? true
			: statusFilter === "collected"
				? false
				: undefined;

	const billingMonthId =
		monthFilter && monthFilter !== "all"
			? monthFilter
			: (activeMonthId ?? undefined);

	const { payments, total, isLoading, isFetching } = usePaymentsQuery({
		collectorId,
		billingMonthId,
		stoppedAccount,
		groupName: groupFilter || undefined,
		search: search || undefined,
		page,
		pageSize: PAGE_SIZE,
		sortBy: "paidAt",
		sortOrder: "desc",
	});

	const deletePayment = useDeletePayment();
	const [pendingDelete, setPendingDelete] = useState<string | null>(null);

	const handleDelete = (paymentId: string) => {
		if (!organizationId) {
			return;
		}
		toast.promise(
			deletePayment.mutateAsync({ organizationId, paymentId }),
			{
				loading: "Deleting payment…",
				success: "Payment deleted",
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to delete payment",
			},
		);
		setPendingDelete(null);
	};

	const columns: ColumnDef<PaymentRow, unknown>[] = [
		{
			id: "customer",
			header: "Customer",
			cell: ({ row }) => {
				const c = row.original.customer;
				return (
					<div className="min-w-0">
						<a
							href={`/app/${orgSlug}/customers/${c.id}`}
							className="block truncate text-sm font-medium hover:underline"
						>
							{displayName(c.firstName, c.lastName)}
						</a>
						{c.username && (
							<div className="truncate text-[11px] text-muted-foreground">
								@{c.username}
							</div>
						)}
					</div>
				);
			},
		},
		{
			id: "area",
			header: "Area",
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground">
					{row.original.customer.groupName ?? "—"}
				</span>
			),
		},
		{
			id: "amount",
			header: "Amount",
			meta: { className: "text-right" },
			cell: ({ row }) => (
				<span className="block text-right text-sm font-medium tabular-nums">
					{formatCurrency(row.original.paidAmount)}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge
					variant={getPaymentStatusVariant(
						row.original.stoppedAccount,
						row.original.debtAccount,
					)}
					className="text-[10px]"
				>
					{getPaymentStatusLabel(
						row.original.stoppedAccount,
						row.original.debtAccount,
					)}
				</Badge>
			),
		},
		{
			id: "month",
			header: "Month",
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground tabular-nums">
					{row.original.billingMonth
						? formatCycleShort(
								row.original.billingMonth.year,
								row.original.billingMonth.month,
							)
						: "—"}
				</span>
			),
		},
		{
			id: "paidAt",
			header: "Paid",
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground tabular-nums">
					{formatDate(row.original.paidAt)}
				</span>
			),
		},
		{
			id: "note",
			header: "Note",
			cell: ({ row }) => {
				const category = row.original.noteCategory;
				const notes = row.original.notes;
				if (!category && !notes) {
					return (
						<span className="text-xs text-muted-foreground/40">
							—
						</span>
					);
				}
				return (
					<div className="max-w-[180px]">
						{category && (
							<Badge
								variant="outline"
								className="text-[10px] font-normal"
							>
								{NOTE_CATEGORY_LABELS[category] ?? category}
							</Badge>
						)}
						{notes && (
							<span className="block truncate text-[11px] text-muted-foreground">
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
			meta: { className: "w-10 text-right" },
			cell: ({ row }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label="Payment actions"
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
								View invoice
							</a>
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							onClick={() => setPendingDelete(row.original.id)}
						>
							<TrashIcon className="mr-2 size-4" />
							Delete payment
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	];

	return (
		<ContentCard>
			<ContentCardToolbar>
				<SearchInput
					value={search}
					onChange={(v) => {
						setSearch(v);
						setPage(1);
					}}
					placeholder="Search customer…"
					className="w-full sm:max-w-xs"
				/>
				<Select
					value={statusFilter || "all"}
					onValueChange={(v) => {
						setStatusFilter(v === "all" ? "" : v);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-full sm:w-36">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						<SelectItem value="collected">Collected</SelectItem>
						<SelectItem value="stopped">Stopped</SelectItem>
					</SelectContent>
				</Select>
				<GroupSelect
					value={groupFilter}
					onChange={(v) => {
						setGroupFilter(v);
						setPage(1);
					}}
					groups={groups}
				/>
				<BillingCycleSelect
					value={monthFilter || activeMonthId || ""}
					onValueChange={(v) => {
						setMonthFilter(v);
						setPage(1);
					}}
					options={monthOptions}
					allLabel="All months"
				/>
			</ContentCardToolbar>

			<DataTable
				columns={columns}
				data={payments as PaymentRow[]}
				isLoading={isLoading}
				isFetching={isFetching}
				pagination={{
					totalItems: total,
					currentPage: page,
					itemsPerPage: PAGE_SIZE,
					onPageChange: setPage,
				}}
				emptyState={
					<EmptyState
						icon={ReceiptTextIcon}
						title="No payments"
						description={`No payments found for ${collectorName} with the current filters.`}
					/>
				}
			/>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(o) => !o && setPendingDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete payment?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the payment record and
							recalculates the collector's balance. It cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								pendingDelete && handleDelete(pendingDelete)
							}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ContentCard>
	);
}

interface PaymentRow {
	id: string;
	paidAmount: number;
	stoppedAccount: boolean;
	debtAccount?: boolean;
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

// ─── Handoffs panel ──────────────────────────────────────────────────

function HandoffsPanel({
	collectorId,
	organizationId,
}: {
	collectorId: string;
	organizationId: string | null;
}) {
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		HANDOFF_SORT_BY_MAP,
		() => setPage(1),
	);

	const { data: collectionsData, isLoading } = useQuery(
		organizationId
			? orpc.billing.collections.list.queryOptions({
					input: {
						organizationId,
						collectorId,
						page,
						pageSize: PAGE_SIZE,
						sortBy,
						sortOrder,
					},
				})
			: disabledQuery(["billing", "collections", "list", "collector"]),
	);

	const handoffs = (collectionsData?.collections ?? []) as HandoffRow[];
	const total = collectionsData?.total ?? 0;

	const deleteCollection = useDeleteCollection();
	const [pendingDelete, setPendingDelete] = useState<HandoffRow | null>(null);

	const handleDelete = (row: HandoffRow) => {
		if (!organizationId) {
			return;
		}
		toast.promise(
			deleteCollection.mutateAsync({
				organizationId,
				collectionId: row.id,
			}),
			{
				loading: "Deleting…",
				success: "Entry deleted",
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to delete",
			},
		);
		setPendingDelete(null);
	};

	const columns: ColumnDef<HandoffRow, unknown>[] = [
		{
			id: "collectedAt",
			accessorKey: "collectedAt",
			header: "Date",
			enableSorting: true,
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
					{formatDateTime(row.original.collectedAt)}
				</span>
			),
		},
		{
			id: "type",
			accessorKey: "type",
			header: "Type",
			enableSorting: true,
			cell: ({ row }) => {
				const t = row.original.type;
				const tone =
					t === "HANDOFF"
						? "border-success/40 bg-success/10 text-success"
						: t === "CASH_FLOAT"
							? "border-primary/40 bg-primary/10 text-primary"
							: t === "SALARY"
								? "border-border bg-muted text-foreground"
								: t === "STORE_PURCHASE"
									? "border-warning/40 bg-warning/10 text-warning"
									: "border-destructive/40 bg-destructive/10 text-destructive";
				const label =
					t === "HANDOFF"
						? "Handoff"
						: t === "CASH_FLOAT"
							? "Float"
							: t === "SALARY"
								? "His pay"
								: t === "STORE_PURCHASE"
									? "Purchase"
									: "Expense";
				return (
					<Badge
						variant="outline"
						className={cn("text-[10px]", tone)}
					>
						{label}
					</Badge>
				);
			},
		},
		{
			id: "amount",
			accessorKey: "amount",
			header: "Amount",
			enableSorting: true,
			meta: { className: "text-right" },
			cell: ({ row }) => (
				<span className="block text-right text-sm font-medium tabular-nums">
					{formatCurrency(row.original.amount)}
				</span>
			),
		},
		{
			id: "receivedBy",
			header: "Received by",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground">
					{row.original.receivedBy?.name ?? "—"}
				</span>
			),
		},
		{
			id: "notes",
			header: "Note",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="block max-w-[260px] truncate text-xs text-muted-foreground">
					{row.original.notes ?? "—"}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			enableSorting: false,
			meta: { className: "w-10 text-right" },
			// Only entries created in this app are deletable; synced legacy rows
			// (externalBillingId) re-sync, so they stay read-only.
			cell: ({ row }) =>
				row.original.externalBillingId === null ? (
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground hover:text-destructive"
						onClick={() => setPendingDelete(row.original)}
						aria-label="Delete entry"
					>
						<TrashIcon className="size-3.5" />
					</Button>
				) : null,
		},
	];

	return (
		<ContentCard>
			<DataTable
				columns={columns}
				data={handoffs}
				isLoading={isLoading}
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
						icon={HandCoinsIcon}
						title="No handoffs yet"
						description="Recorded handoffs and approved expenses will appear here."
					/>
				}
			/>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(o) => !o && setPendingDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete entry?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete?.type === "HANDOFF"
								? "The collector's in-hand balance will jump back up by the handoff amount."
								: pendingDelete?.type === "CASH_FLOAT"
									? "This removes the float. His cash in hand goes back down by the amount."
									: pendingDelete?.type === "SALARY"
										? "This removes his pay and its expense. His cash in hand is unchanged."
										: "This removes the entry and its linked expense; the collector's balance will adjust accordingly."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								pendingDelete && handleDelete(pendingDelete)
							}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ContentCard>
	);
}

interface HandoffRow {
	id: string;
	amount: number;
	notes: string | null;
	type:
		| "HANDOFF"
		| "SALARY"
		| "CASH_FLOAT"
		| "STORE_PURCHASE"
		| "EXPENSE_DEDUCTION"
		| "EXPENSE"
		| string;
	externalBillingId: number | null;
	collectedAt: string | Date;
	receivedBy: { id: string; name: string } | null;
}

// ─── Mutation wrappers (kept local to colocate invalidation contracts) ──

function useCollectorCreate() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.billing.collections.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.collections.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.collectors.key(),
			});
		},
	});
}

// ─── Skeleton ────────────────────────────────────────────────────────

export function CollectorWorkspaceSkeleton() {
	return (
		<div className="space-y-6">
			<MetricStrip columns={4}>
				{Array.from({ length: 4 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>
			<Skeleton className="h-14 rounded-lg" />
			<Skeleton className="h-9 w-64 rounded-lg" />
			<div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
				<div className="border-b border-border bg-surface-subtle/40 px-3 py-2.5 md:px-4">
					<Skeleton className="h-8 w-72" />
				</div>
				<div className="divide-y divide-border">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center gap-4 px-4 py-3"
						>
							<Skeleton className="h-3 flex-1 max-w-32" />
							<Skeleton className="h-3 flex-1 max-w-20" />
							<Skeleton className="h-3 flex-1 max-w-16" />
							<Skeleton className="h-3 flex-1 max-w-16" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

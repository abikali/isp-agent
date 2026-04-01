"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
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
	MoreHorizontalIcon,
	RotateCcwIcon,
	SendIcon,
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
	useResendReceipt,
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
	| "needs_review"
	| "receipt_sent"
	| "receipt_failed"
	| "receipt_pending";

interface ActivityLogEntry {
	action: string;
	status: "success" | "failed" | "skipped";
	statusCode?: number;
	error?: string;
	detail?: string;
	timestamp: string;
}

interface PaymentRow {
	id: string;
	customer: {
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		mobile: string | null;
		phone: string | null;
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
	receiptSent: boolean;
	activityLog: unknown;
	reviewedAt: string | Date | null;
}

function StatsBar({ billingMonthId }: { billingMonthId: string | undefined }) {
	const { data: stats } = usePaymentStatsQuery(billingMonthId);

	if (!stats) {
		return null;
	}

	return (
		<StatCardGroup columns={4}>
			<StatCard
				title="Collected"
				value={formatCurrency(stats.totalCollected)}
				color="emerald"
				description={`${stats.collectedPayments} payments`}
			/>
			<StatCard
				title="Stopped"
				value={stats.stoppedPayments}
				color="red"
				description="accounts"
			/>
			<StatCard
				title="Unpaid"
				value={stats.unpaidCustomers}
				color="orange"
				description="customers"
			/>
			<StatCard
				title="Needs Review"
				value={stats.unreviewedCount}
				color={stats.unreviewedCount > 0 ? "amber" : "default"}
				description="flagged"
			/>
		</StatCardGroup>
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
	{ key: "receipt_sent", label: "Receipt Sent", icon: CheckCircle2Icon },
	{ key: "receipt_failed", label: "Receipt Failed", icon: AlertTriangleIcon },
	{ key: "receipt_pending", label: "Receipt Pending", icon: SendIcon },
];

const NOTE_CATEGORIES = Object.entries(NOTE_CATEGORY_LABELS);

function deriveQueryFilters(typeFilter: PaymentTypeFilter): {
	stoppedAccount?: boolean;
	freeAccount?: boolean;
	unreviewedOnly?: boolean;
	amountMismatch?: "any" | "overpaid" | "underpaid";
	receiptStatus?: "sent" | "failed" | "pending";
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
		case "receipt_sent":
			return { receiptStatus: "sent" };
		case "receipt_failed":
			return { receiptStatus: "failed" };
		case "receipt_pending":
			return { receiptStatus: "pending" };
		default:
			return {};
	}
}

// ─── Resend Receipt Dialog ─────────────────────────────────────

function ResendReceiptDialog({
	open,
	onOpenChange,
	paymentId,
	defaultPhone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	paymentId: string;
	defaultPhone: string;
}) {
	const organizationId = useOrganizationId();
	const resendReceipt = useResendReceipt();
	const [useCustomPhone, setUseCustomPhone] = useState(false);
	const [customPhone, setCustomPhone] = useState("");

	function handleSend() {
		if (!organizationId) {
			return;
		}
		const phone = useCustomPhone ? customPhone.trim() : undefined;
		if (useCustomPhone && !phone) {
			toast.error("Please enter a phone number");
			return;
		}
		resendReceipt.mutate(
			{ organizationId, paymentId, phone },
			{
				onSuccess: () => {
					toast.success("Receipt queued for delivery");
					onOpenChange(false);
					setUseCustomPhone(false);
					setCustomPhone("");
				},
				onError: (error) => toast.error(error.message),
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Resend WhatsApp Receipt</DialogTitle>
					<DialogDescription>
						Send the payment receipt via WhatsApp.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label>Send to</Label>
						<div className="flex flex-col gap-2">
							<Button
								type="button"
								variant={
									useCustomPhone ? "outline" : "secondary"
								}
								size="sm"
								className="justify-start"
								onClick={() => setUseCustomPhone(false)}
							>
								Customer's number: {defaultPhone || "N/A"}
							</Button>
							<Button
								type="button"
								variant={
									useCustomPhone ? "secondary" : "outline"
								}
								size="sm"
								className="justify-start"
								onClick={() => setUseCustomPhone(true)}
							>
								Different number
							</Button>
						</div>
					</div>
					{useCustomPhone && (
						<div className="space-y-1.5">
							<Label htmlFor="custom-phone">Phone number</Label>
							<Input
								id="custom-phone"
								type="tel"
								placeholder="e.g. +96176123456"
								value={customPhone}
								onChange={(e) => setCustomPhone(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Include country code (e.g. +961)
							</p>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSend}
						disabled={resendReceipt.isPending}
					>
						<SendIcon className="mr-1.5 size-3.5" />
						{resendReceipt.isPending
							? "Sending..."
							: "Send Receipt"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Activity Log Dialog ────────────────────────────────────────

function ActivityLogDialog({
	open,
	onOpenChange,
	log,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	log: ActivityLogEntry[];
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Activity Log</DialogTitle>
					<DialogDescription>
						All events for this payment.
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-80 overflow-y-auto">
					{log.length === 0 ? (
						<p className="py-4 text-center text-sm text-muted-foreground">
							No activity recorded yet.
						</p>
					) : (
						<div className="space-y-2">
							{log.map((entry, i) => (
								<div
									key={i}
									className="flex items-start gap-3 rounded-lg border p-3 text-sm"
								>
									<span
										className={
											entry.status === "success"
												? "mt-0.5 text-emerald-500"
												: entry.status === "failed"
													? "mt-0.5 text-destructive"
													: "mt-0.5 text-muted-foreground"
										}
									>
										{entry.status === "success" ? (
											<CheckCircle2Icon className="size-4" />
										) : entry.status === "failed" ? (
											<AlertTriangleIcon className="size-4" />
										) : (
											<CircleDotIcon className="size-4" />
										)}
									</span>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium">
												{entry.action
													.replace(/_/g, " ")
													.replace(/\b\w/g, (c) =>
														c.toUpperCase(),
													)}
											</span>
											<Badge
												variant={
													entry.status === "success"
														? "default"
														: entry.status ===
																"failed"
															? "destructive"
															: "secondary"
												}
												className="text-[10px] px-1.5"
											>
												{entry.status}
											</Badge>
										</div>
										{entry.detail && (
											<p className="text-xs text-muted-foreground mt-0.5">
												{entry.detail}
											</p>
										)}
										{entry.error && (
											<p className="text-xs text-destructive mt-0.5">
												{entry.error}
											</p>
										)}
										<p className="text-xs text-muted-foreground mt-1">
											{new Date(
												entry.timestamp,
											).toLocaleString()}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ─── Receipt Badge ──────────────────────────────────────────────

function getReceiptBadge(payment: PaymentRow) {
	if (payment.stoppedAccount) {
		return null;
	}
	if (payment.receiptSent) {
		return (
			<Badge
				variant="default"
				className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]"
			>
				Sent
			</Badge>
		);
	}
	const log = Array.isArray(payment.activityLog)
		? (payment.activityLog as ActivityLogEntry[])
		: [];
	const lastReceipt = [...log]
		.reverse()
		.find(
			(e) =>
				typeof e.action === "string" &&
				e.action.startsWith("whatsapp_receipt"),
		);
	if (lastReceipt?.status === "failed") {
		return (
			<Badge variant="destructive" className="text-[10px]">
				Failed
			</Badge>
		);
	}
	return (
		<Badge variant="secondary" className="text-[10px]">
			Pending
		</Badge>
	);
}

// ─── Main Component ─────────────────────────────────────────────

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

	// Dialog state
	const [resendDialogPayment, setResendDialogPayment] = useState<{
		id: string;
		phone: string;
	} | null>(null);
	const [activityLogDialog, setActivityLogDialog] = useState<
		ActivityLogEntry[] | null
	>(null);

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
				id: "time",
				header: "Time",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm tabular-nums text-muted-foreground">
						{new Date(row.original.paidAt).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						})}
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
				id: "receipt",
				header: "Receipt",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => getReceiptBadge(row.original),
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
				enableHiding: false,
				cell: ({ row }) => {
					const payment = row.original;
					const needsReview = isUnreviewed(payment);
					const log = Array.isArray(payment.activityLog)
						? (payment.activityLog as ActivityLogEntry[])
						: [];
					const customerPhone =
						payment.customer.mobile ?? payment.customer.phone ?? "";

					return (
						<div className="flex items-center gap-1">
							{/* Review button — always visible when needed */}
							{organizationId && needsReview && (
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
														paymentId: payment.id,
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

							{/* Three-dots menu */}
							{organizationId && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="sm"
											variant="ghost"
											className="size-7 p-0"
										>
											<MoreHorizontalIcon className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{!payment.stoppedAccount && (
											<DropdownMenuItem
												onClick={() =>
													setResendDialogPayment({
														id: payment.id,
														phone: customerPhone,
													})
												}
											>
												<SendIcon className="mr-2 size-3.5" />
												{payment.receiptSent
													? "Resend Receipt"
													: "Send Receipt"}
											</DropdownMenuItem>
										)}
										{log.length > 0 && (
											<DropdownMenuItem
												onClick={() =>
													setActivityLogDialog(log)
												}
											>
												<ListIcon className="mr-2 size-3.5" />
												View Activity Log
											</DropdownMenuItem>
										)}
										{(!payment.stoppedAccount ||
											log.length > 0) && (
											<DropdownMenuSeparator />
										)}
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<DropdownMenuItem
													className="text-destructive focus:text-destructive"
													onSelect={(e) =>
														e.preventDefault()
													}
												>
													<TrashIcon className="mr-2 size-3.5" />
													Delete Payment
												</DropdownMenuItem>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Delete payment?
													</AlertDialogTitle>
													<AlertDialogDescription>
														This will permanently
														delete this payment of{" "}
														{formatCurrency(
															payment.paidAmount,
														)}{" "}
														and reset the
														customer&apos;s paid
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
																		payment.id,
																},
																{
																	onSuccess:
																		() =>
																			toast.success(
																				"Payment deleted",
																			),
																	onError: (
																		error,
																	) =>
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
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					);
				},
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
						columnVisibilityKey="payments-list"
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

			{/* Resend Receipt Dialog */}
			<ResendReceiptDialog
				open={!!resendDialogPayment}
				onOpenChange={(open) => {
					if (!open) {
						setResendDialogPayment(null);
					}
				}}
				paymentId={resendDialogPayment?.id ?? ""}
				defaultPhone={resendDialogPayment?.phone ?? ""}
			/>

			{/* Activity Log Dialog */}
			<ActivityLogDialog
				open={!!activityLogDialog}
				onOpenChange={(open) => {
					if (!open) {
						setActivityLogDialog(null);
					}
				}}
				log={activityLogDialog ?? []}
			/>
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

"use client";

import { parsePhones } from "@repo/database/phones";
import { useActiveOrganization } from "@saas/organizations/client";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { CountBadge } from "@shared/components/CountBadge";
import { EmptyState } from "@shared/components/EmptyState";
import { SearchInput } from "@shared/components/SearchInput";
import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import {
	formatCurrency,
	formatDate,
	formatDateTime,
	formatTime,
} from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
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
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	ArrowDownIcon,
	ArrowUpDownIcon,
	ArrowUpIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	CheckIcon,
	CircleDotIcon,
	CloudUploadIcon,
	ExternalLinkIcon,
	FilterIcon,
	GiftIcon,
	ListIcon,
	Loader2Icon,
	MessageCircleIcon,
	MonitorIcon,
	MoreHorizontalIcon,
	PercentIcon,
	ReceiptIcon,
	RotateCcwIcon,
	SendIcon,
	TrashIcon,
	UserCogIcon,
	WifiOffIcon,
	XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CustomerBulkActionsBar } from "../../customers/components/CustomerBulkActionsBar";
import {
	ChangeNameDialog,
	type IradiusCustomerRef,
	ResetMacDialog,
	SetDiscountDialog,
	SetExpiryDialog,
	SetIptvPriceDialog,
} from "../../customers/components/CustomerIradiusDialogs";
import {
	usePushToIRadius,
	useSetDiscount,
} from "../../customers/hooks/use-customers";
import {
	useCollectors,
	useCustomerGroups,
	useDeclineStoppedPayment,
	useDeletePayment,
	useMarkReceiptSent,
	useMonthFilter,
	usePaymentStatsQuery,
	usePaymentsQuery,
	useResendReceipt,
	useReviewPayment,
} from "../hooks/use-billing";
import {
	FLAG_LEGEND,
	getPaymentFlagBadgeClassName,
	getPaymentFlagLabel,
	getPaymentFlagVariant,
	getPaymentRowClassName,
	isAmountMismatch,
	isUnreviewed,
	NOTE_CATEGORY_LABELS,
} from "../lib/billing-utils";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { CollectorSelect, GroupSelect } from "./BillingFilters";
import { ChangePlanDialog } from "./ChangePlanDialog";

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
	| "recently_reviewed"
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

function collectCustomerPhones(customer: {
	mobile: string | null;
	phone: string | null;
	phones: unknown;
}): string[] {
	const all = [
		...parsePhones(customer.phones).map((p) => p.number),
		customer.mobile ?? "",
		customer.phone ?? "",
	]
		.map((p) => p.trim())
		.filter(Boolean);
	return [...new Set(all)];
}

function DateTimeCell({ value }: { value: string | Date | null | undefined }) {
	if (!value) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	const time = formatTime(value, {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	const hasTime = time !== "00:00";
	return (
		<div className="flex flex-col leading-tight">
			<span className="text-sm">{formatDate(value)}</span>
			{hasTime && (
				<span className="text-[11px] tabular-nums text-muted-foreground">
					{time}
				</span>
			)}
		</div>
	);
}

function openConversationsForPhone(
	orgSlug: string,
	phone: string,
	name?: string,
): void {
	const trimmed = phone.trim();
	if (!orgSlug || !trimmed) {
		return;
	}
	const params = new URLSearchParams({ phone: trimmed });
	if (name) {
		params.set("name", name);
	}
	window.open(
		`/app/${orgSlug}/conversations/open?${params.toString()}`,
		"_blank",
		"noopener,noreferrer",
	);
}

interface PaymentRow {
	id: string;
	customer: {
		id: string;
		externalId: string | null;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		mobile: string | null;
		phone: string | null;
		phones: unknown;
		expiresAt: string | Date | null;
		iptvPrice: number;
		realIpPrice: number;
		discount: number;
		planId: string | null;
		plan: { id: string; name: string } | null;
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
	referredCustomer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
	} | null;
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
	{
		key: "recently_reviewed",
		label: "Recently Reviewed",
		icon: CheckCircle2Icon,
	},
	{ key: "receipt_sent", label: "Receipt Sent", icon: CheckCircle2Icon },
	{ key: "receipt_failed", label: "Receipt Failed", icon: AlertTriangleIcon },
	{ key: "receipt_pending", label: "Receipt Pending", icon: SendIcon },
];

const NOTE_CATEGORIES = Object.entries(NOTE_CATEGORY_LABELS);

function deriveQueryFilters(typeFilter: PaymentTypeFilter): {
	stoppedAccount?: boolean;
	freeAccount?: boolean;
	unreviewedOnly?: boolean;
	reviewedOnly?: boolean;
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
		case "recently_reviewed":
			return { reviewedOnly: true };
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
											{formatDateTime(entry.timestamp)}
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

// oRPC surfaces the server's custom error code on the thrown error. This
// one is raised when "Approve & Deactivate" can't reach the customer in
// iRadius because it was already deleted there.
function isIradiusUserMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "IRADIUS_USER_MISSING"
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

	// Drives the Needs Review filter's red attention treatment in the toolbar
	// — same source as the StatsBar card and the BillingNav badge.
	const { data: parentStats } = usePaymentStatsQuery(activeMonthId);
	const unreviewedCount = parentStats?.unreviewedCount ?? 0;

	const { payments, total, isLoading, isFetching } = usePaymentsQuery({
		search: debouncedSearch || undefined,
		...queryTypeFilters,
		noteCategory: noteCategoryFilter,
		collectorId: collectorFilter,
		groupName: groupFilter,
		billingMonthId: activeMonthId,
		page,
		pageSize: PAGE_SIZE,
		sortBy: typeFilter === "recently_reviewed" ? "reviewedAt" : sortBy,
		sortOrder: typeFilter === "recently_reviewed" ? "desc" : sortOrder,
	});

	const { data: collectorsData } = useCollectors();
	const { groups } = useCustomerGroups();
	const collectors = collectorsData?.collectors ?? [];

	const organizationId = useOrganizationId();
	const { activeOrganization } = useActiveOrganization();
	const orgSlug = activeOrganization?.slug ?? "";
	const deletePayment = useDeletePayment();
	const reviewPayment = useReviewPayment();
	const declineStoppedPayment = useDeclineStoppedPayment();
	const markReceiptSent = useMarkReceiptSent();
	const setDiscount = useSetDiscount();
	const pushToIRadius = usePushToIRadius();
	const [discountDialog, setDiscountDialog] = useState<{
		paymentId: string;
		customerId: string;
		customerName: string;
		currentDiscount: number;
		discount: string;
	} | null>(null);
	const [changePlanDialog, setChangePlanDialog] = useState<{
		customerId: string;
		currentPlanId: string | null;
	} | null>(null);
	const [whatsappPickerDialog, setWhatsappPickerDialog] = useState<{
		customerName: string;
		phones: string[];
	} | null>(null);
	const [noteDialog, setNoteDialog] = useState<{
		category: string | null;
		notes: string | null;
	} | null>(null);
	// Per-row iRadius dialog state. Lifted out of the row cell so we can
	// mount the five `CustomerIradiusDialogs` once at the component level
	// rather than per-row; the customer snapshot we need for pre-seeding
	// (name, discount, iptv, expiry) is carried along with the kind.
	const [iradiusRowDialog, setIradiusRowDialog] = useState<{
		kind:
			| "reset-mac"
			| "change-name"
			| "set-discount"
			| "set-iptv-price"
			| "set-expiry";
		customer: IradiusCustomerRef;
	} | null>(null);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	// Opened when "Approve & Deactivate" fails because the customer was
	// already deleted in iRadius. Carries the row so we can name the customer
	// and retry the review with `force` (local-only deactivation).
	const [iradiusMissingPayment, setIradiusMissingPayment] =
		useState<PaymentRow | null>(null);

	// Selected payments → unique customer ids. A single customer can own
	// multiple payments in the table (overpaid + free, or one payment per
	// month), and the bulk customer actions are de-duplicated by id at the
	// server (`WHERE id IN (...)` collapses duplicates), but we shrink the
	// payload here too so the toast counts match operator expectations.
	const selectedCustomerIds = useMemo(() => {
		const ids = new Set<string>();
		const selectedPaymentIds = new Set(Object.keys(rowSelection));
		for (const payment of payments) {
			if (selectedPaymentIds.has(payment.id)) {
				ids.add(payment.customer.id);
			}
		}
		return Array.from(ids);
	}, [rowSelection, payments]);
	const selectedCount = selectedCustomerIds.length;

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
				id: "customer",
				header: "Customer",
				enableSorting: false,
				cell: ({ row }) => {
					const c = row.original.customer;
					const name = displayName(c.firstName, c.lastName);
					const href = orgSlug
						? `/app/${orgSlug}/customers/${c.id}`
						: undefined;
					return (
						<>
							{href ? (
								<a
									href={href}
									className="font-medium hover:underline"
								>
									{name}
								</a>
							) : (
								<div className="font-medium">{name}</div>
							)}
							<div className="text-xs text-muted-foreground">
								{c.username}
							</div>
						</>
					);
				},
			},
			{
				id: "collector",
				header: "Collector",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.collector.name}
					</span>
				),
			},
			{
				id: "plan",
				header: "Plan",
				enableSorting: false,
				cell: ({ row }) => {
					const plan = row.original.customer.plan;
					if (!plan) {
						return (
							<span className="text-xs text-muted-foreground">
								—
							</span>
						);
					}
					return (
						<Badge
							variant="outline"
							className="text-xs font-normal"
						>
							{plan.name}
						</Badge>
					);
				},
			},
			{
				id: "date",
				header: "Paid Date",
				accessorFn: (row) => row.paidAt,
				enableSorting: true,
				cell: ({ row }) => <DateTimeCell value={row.original.paidAt} />,
			},
			{
				id: "expiry",
				header: "Expiry",
				enableSorting: false,
				cell: ({ row }) => (
					<DateTimeCell value={row.original.customer.expiresAt} />
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
					const expected =
						p.accountPrice +
						(p.customer.iptvPrice ?? 0) +
						(p.customer.realIpPrice ?? 0) -
						p.discount;
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
					const badgeClassName =
						getPaymentFlagBadgeClassName(payment);
					const needsReview = isUnreviewed(payment);
					const referred = payment.referredCustomer;
					return (
						<div className="flex flex-col gap-0.5">
							<div className="flex items-center gap-1.5">
								<Badge
									variant={variant}
									className={badgeClassName}
								>
									{label}
								</Badge>
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
							{payment.freeAccount && referred && orgSlug && (
								<Tooltip>
									<TooltipTrigger asChild>
										<a
											href={`/app/${orgSlug}/customers/${referred.id}`}
											onClick={(e) => e.stopPropagation()}
											className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
										>
											<GiftIcon className="size-3 text-emerald-600" />
											<span className="truncate max-w-[140px]">
												{displayName(
													referred.firstName,
													referred.lastName,
												) || referred.username}
											</span>
										</a>
									</TooltipTrigger>
									<TooltipContent>
										Free via referral — open referrer
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
				cell: ({ row }) => getReceiptBadge(row.original),
			},
			{
				id: "note",
				header: "Note",
				enableSorting: false,
				meta: { className: "max-w-[220px]" },
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
						<button
							type="button"
							onClick={() => setNoteDialog({ category, notes })}
							className="flex max-w-[220px] flex-col items-start gap-0.5 text-left hover:opacity-80"
							title="Click to view full note"
						>
							{category && (
								<Badge
									variant="outline"
									className="text-xs font-normal"
								>
									{NOTE_CATEGORY_LABELS[category] ?? category}
								</Badge>
							)}
							{notes && (
								<span className="block w-full truncate text-xs text-muted-foreground">
									{notes}
								</span>
							)}
						</button>
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
					const isReviewing =
						reviewPayment.isPending &&
						reviewPayment.variables?.paymentId === payment.id;
					const isMarkingReceipt =
						markReceiptSent.isPending &&
						markReceiptSent.variables?.paymentId === payment.id;
					const isDeleting =
						deletePayment.isPending &&
						deletePayment.variables?.paymentId === payment.id;
					const log = Array.isArray(payment.activityLog)
						? (payment.activityLog as ActivityLogEntry[])
						: [];
					const customerPhone =
						payment.customer.mobile ?? payment.customer.phone ?? "";
					const whatsappNumbers = collectCustomerPhones(
						payment.customer,
					);

					const isPendingStopped =
						payment.stoppedAccount && payment.reviewedAt === null;
					const isDeclining =
						declineStoppedPayment.isPending &&
						declineStoppedPayment.variables?.paymentId ===
							payment.id;

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
											disabled={
												isReviewing || isDeclining
											}
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
														onError: (error) => {
															if (
																isIradiusUserMissing(
																	error,
																)
															) {
																setIradiusMissingPayment(
																	payment,
																);
																return;
															}
															toast.error(
																error.message,
															);
														},
													},
												)
											}
										>
											{isReviewing ? (
												<Loader2Icon className="size-3.5 animate-spin" />
											) : (
												<CheckIcon className="size-3.5" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{payment.stoppedAccount
											? "Approve & Deactivate"
											: "Mark as reviewed"}
									</TooltipContent>
								</Tooltip>
							)}

							{/* Decline — only for pending-stopped payments */}
							{organizationId && isPendingStopped && (
								<AlertDialog>
									<Tooltip>
										<TooltipTrigger asChild>
											<AlertDialogTrigger asChild>
												<Button
													size="sm"
													variant="ghost"
													className="text-destructive"
													disabled={
														isReviewing ||
														isDeclining
													}
												>
													{isDeclining ? (
														<Loader2Icon className="size-3.5 animate-spin" />
													) : (
														<XIcon className="size-3.5" />
													)}
												</Button>
											</AlertDialogTrigger>
										</TooltipTrigger>
										<TooltipContent>
											Decline stop request
										</TooltipContent>
									</Tooltip>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>
												Decline stop request?
											</AlertDialogTitle>
											<AlertDialogDescription>
												The stop request for{" "}
												{displayName(
													payment.customer.firstName,
													payment.customer.lastName,
												)}{" "}
												will be deleted and the customer
												will reappear on the collector's
												unpaid list. The customer is not
												yet deactivated, so nothing
												changes in iRadius.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>
												Cancel
											</AlertDialogCancel>
											<AlertDialogAction
												disabled={isDeclining}
												onClick={() =>
													declineStoppedPayment.mutate(
														{
															organizationId,
															paymentId:
																payment.id,
														},
														{
															onSuccess: () =>
																toast.success(
																	"Stop request declined",
																),
															onError: (error) =>
																toast.error(
																	error.message,
																),
														},
													)
												}
											>
												Decline
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
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
										<DropdownMenuItem asChild>
											<a
												href={`/invoice/${payment.id}`}
												target="_blank"
												rel="noopener noreferrer"
											>
												<ReceiptIcon className="mr-2 size-3.5" />
												View Invoice
											</a>
										</DropdownMenuItem>
										{orgSlug && (
											<DropdownMenuItem asChild>
												<a
													href={`/app/${orgSlug}/customers/${payment.customer.id}`}
												>
													<ExternalLinkIcon className="mr-2 size-3.5" />
													Open customer
												</a>
											</DropdownMenuItem>
										)}
										{payment.customer.externalId && (
											<DropdownMenuItem
												onClick={() =>
													setChangePlanDialog({
														customerId:
															payment.customer.id,
														currentPlanId:
															payment.customer
																.planId,
													})
												}
											>
												<ArrowUpDownIcon className="mr-2 size-3.5" />
												Change plan
											</DropdownMenuItem>
										)}
										<DropdownMenuSeparator />
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
										{!payment.stoppedAccount &&
											!payment.receiptSent && (
												<DropdownMenuItem
													disabled={isMarkingReceipt}
													onClick={() => {
														if (!organizationId) {
															return;
														}
														markReceiptSent.mutate(
															{
																organizationId,
																paymentId:
																	payment.id,
															},
															{
																onSuccess: () =>
																	toast.success(
																		"Receipt marked as sent",
																	),
																onError: (
																	error,
																) =>
																	toast.error(
																		error.message,
																	),
															},
														);
													}}
												>
													{isMarkingReceipt ? (
														<Loader2Icon className="mr-2 size-3.5 animate-spin" />
													) : (
														<CheckCircle2Icon className="mr-2 size-3.5" />
													)}
													Mark receipt as sent
												</DropdownMenuItem>
											)}
										{whatsappNumbers.length > 0 && (
											<DropdownMenuItem
												onClick={() => {
													const customerName =
														displayName(
															payment.customer
																.firstName,
															payment.customer
																.lastName,
														) ||
														payment.customer
															.username ||
														"Customer";
													if (
														whatsappNumbers.length ===
														1
													) {
														openConversationsForPhone(
															orgSlug,
															whatsappNumbers[0] ??
																"",
															customerName,
														);
														return;
													}
													setWhatsappPickerDialog({
														customerName,
														phones: whatsappNumbers,
													});
												}}
											>
												<MessageCircleIcon className="mr-2 size-3.5" />
												Open conversation
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
										{needsReview && (
											<DropdownMenuItem
												onClick={() =>
													setDiscountDialog({
														paymentId: payment.id,
														customerId:
															payment.customer.id,
														customerName:
															displayName(
																payment.customer
																	.firstName,
																payment.customer
																	.lastName,
															),
														currentDiscount:
															payment.customer
																.discount ?? 0,
														discount: (
															payment.customer
																.discount ?? 0
														).toString(),
													})
												}
											>
												<PercentIcon className="mr-2 size-3.5" />
												Set discount & review
											</DropdownMenuItem>
										)}
										{payment.customer.externalId && (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													disabled={
														pushToIRadius.isPending
													}
													onClick={() => {
														if (!organizationId) {
															return;
														}
														pushToIRadius.mutate(
															{
																organizationId,
																customerId:
																	payment
																		.customer
																		.id,
															},
															{
																onSuccess: () =>
																	toast.success(
																		"Pushed to iRadius",
																	),
																onError: (
																	err,
																) =>
																	toast.error(
																		err.message,
																	),
															},
														);
													}}
												>
													<CloudUploadIcon className="mr-2 size-3.5" />
													Push to iRadius
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														setIradiusRowDialog({
															kind: "reset-mac",
															customer:
																payment.customer,
														})
													}
												>
													<WifiOffIcon className="mr-2 size-3.5" />
													Reset MAC address
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														setIradiusRowDialog({
															kind: "change-name",
															customer:
																payment.customer,
														})
													}
												>
													<UserCogIcon className="mr-2 size-3.5" />
													Change name
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														setIradiusRowDialog({
															kind: "set-discount",
															customer:
																payment.customer,
														})
													}
												>
													<PercentIcon className="mr-2 size-3.5" />
													Set recurring discount
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														setIradiusRowDialog({
															kind: "set-iptv-price",
															customer:
																payment.customer,
														})
													}
												>
													<MonitorIcon className="mr-2 size-3.5" />
													Set IPTV price
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() =>
														setIradiusRowDialog({
															kind: "set-expiry",
															customer:
																payment.customer,
														})
													}
												>
													<CalendarClockIcon className="mr-2 size-3.5" />
													Set billing expiry
												</DropdownMenuItem>
											</>
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
														disabled={isDeleting}
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
		[
			organizationId,
			deletePayment,
			reviewPayment,
			declineStoppedPayment,
			orgSlug,
			markReceiptSent,
			pushToIRadius,
		],
	);

	return (
		<>
			{/* Stats Summary */}
			<StatsBar billingMonthId={activeMonthId} />

			<ContentCard>
				<ContentCardToolbar>
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
				</ContentCardToolbar>

				{/* Type Filter Buttons */}
				<div className="flex flex-col gap-2 border-b border-border bg-surface-subtle/40 px-3 py-2.5 md:px-4">
					<div className="flex flex-wrap gap-1">
						{TYPE_FILTERS.map((f) => {
							const active = typeFilter === f.key;
							// Needs Review gets attention treatment when there
							// are unreviewed payments waiting: solid red fill
							// (active) or red outline + pulsing outward shadow
							// (inactive). Drops back to neutral once the queue
							// is clear so the page stops nagging.
							const isNeedsReview = f.key === "needs_review";
							const flagged =
								isNeedsReview && unreviewedCount > 0;
							return (
								<Button
									key={f.key}
									size="sm"
									variant={active ? "secondary" : "outline"}
									onClick={() => handleTypeChange(f.key)}
									className={cn(
										flagged &&
											!active &&
											"border-destructive/40 bg-destructive/5 text-destructive animate-pulse-attention hover:bg-destructive/10 hover:text-destructive",
										flagged &&
											active &&
											"border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground",
									)}
								>
									{f.icon && (
										<f.icon className="mr-1 size-3.5" />
									)}
									{f.label}
									{isNeedsReview && (
										<CountBadge
											count={unreviewedCount}
											size="sm"
											className={cn(
												"ml-1.5",
												active &&
													"bg-destructive-foreground text-destructive ring-destructive-foreground/30",
											)}
										/>
									)}
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

				{organizationId && selectedCount > 0 && (
					<CustomerBulkActionsBar
						count={selectedCount}
						customerIds={selectedCustomerIds}
						organizationId={organizationId}
						collectors={collectors}
						onCleared={() => setRowSelection({})}
					/>
				)}

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
						enableRowSelection
						rowSelection={rowSelection}
						onRowSelectionChange={setRowSelection}
						getRowId={(row) => row.id}
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
			</ContentCard>

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

			<Dialog
				open={!!noteDialog}
				onOpenChange={(open) => {
					if (!open) {
						setNoteDialog(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Payment note</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						{noteDialog?.category && (
							<Badge
								variant="outline"
								className="text-xs font-normal"
							>
								{NOTE_CATEGORY_LABELS[noteDialog.category] ??
									noteDialog.category}
							</Badge>
						)}
						{noteDialog?.notes && (
							<p className="whitespace-pre-wrap break-words text-sm text-foreground">
								{noteDialog.notes}
							</p>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!whatsappPickerDialog}
				onOpenChange={(open) => {
					if (!open) {
						setWhatsappPickerDialog(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Open conversation</DialogTitle>
						<DialogDescription>
							{whatsappPickerDialog?.customerName} has multiple
							numbers. Select one to open the conversation.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2 py-2">
						{whatsappPickerDialog?.phones.map((phone) => (
							<Button
								key={phone}
								variant="outline"
								className="justify-start gap-2"
								onClick={() => {
									openConversationsForPhone(
										orgSlug,
										phone,
										whatsappPickerDialog?.customerName,
									);
									setWhatsappPickerDialog(null);
								}}
							>
								<MessageCircleIcon className="size-4" />
								{phone}
							</Button>
						))}
					</div>
				</DialogContent>
			</Dialog>

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

			{organizationId && changePlanDialog && (
				<ChangePlanDialog
					open={!!changePlanDialog}
					onOpenChange={(o) => !o && setChangePlanDialog(null)}
					organizationId={organizationId}
					customerId={changePlanDialog.customerId}
					currentPlanId={changePlanDialog.currentPlanId}
				/>
			)}

			{/*
			 * Shown when "Approve & Deactivate" couldn't reach the customer in
			 * iRadius because it was already deleted there. Rather than a raw
			 * error, we explain what happened and let the operator finish the
			 * deactivation locally (force) — marking the payment reviewed,
			 * voiding the month's invoice, and closing the review task.
			 */}
			{organizationId && (
				<AlertDialog
					open={!!iradiusMissingPayment}
					onOpenChange={(o) => !o && setIradiusMissingPayment(null)}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Customer no longer in iRadius
							</AlertDialogTitle>
							<AlertDialogDescription>
								{iradiusMissingPayment && (
									<>
										<span className="font-medium">
											{displayName(
												iradiusMissingPayment.customer
													.firstName,
												iradiusMissingPayment.customer
													.lastName,
											)}
										</span>{" "}
										couldn't be deactivated in iRadius
										because the account no longer exists
										there — it was most likely deleted
										directly in iRadius.
										<br />
										<br />
										You can deactivate it here anyway: the
										payment will be marked reviewed, this
										month's invoice voided, and the review
										task closed. Nothing further is sent to
										iRadius.
									</>
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								disabled={reviewPayment.isPending}
								onClick={() => {
									if (
										!organizationId ||
										!iradiusMissingPayment
									) {
										return;
									}
									reviewPayment.mutate(
										{
											organizationId,
											paymentId: iradiusMissingPayment.id,
											force: true,
										},
										{
											onSuccess: () => {
												toast.success(
													"Deactivated locally",
												);
												setIradiusMissingPayment(null);
											},
											onError: (error) =>
												toast.error(error.message),
										},
									);
								}}
							>
								Deactivate locally
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}

			{/*
			 * Per-row iRadius dialogs. One state owns the active kind +
			 * the customer snapshot it operates on, so the dialogs can
			 * pre-seed inputs (current discount / IPTV / expiry / name)
			 * without each row mounting its own dialog instances.
			 */}
			{organizationId && iradiusRowDialog && (
				<>
					<ResetMacDialog
						open={iradiusRowDialog.kind === "reset-mac"}
						onOpenChange={(o) => !o && setIradiusRowDialog(null)}
						organizationId={organizationId}
						customer={iradiusRowDialog.customer}
					/>
					<ChangeNameDialog
						open={iradiusRowDialog.kind === "change-name"}
						onOpenChange={(o) => !o && setIradiusRowDialog(null)}
						organizationId={organizationId}
						customer={iradiusRowDialog.customer}
					/>
					<SetDiscountDialog
						open={iradiusRowDialog.kind === "set-discount"}
						onOpenChange={(o) => !o && setIradiusRowDialog(null)}
						organizationId={organizationId}
						customer={iradiusRowDialog.customer}
					/>
					<SetIptvPriceDialog
						open={iradiusRowDialog.kind === "set-iptv-price"}
						onOpenChange={(o) => !o && setIradiusRowDialog(null)}
						organizationId={organizationId}
						customer={iradiusRowDialog.customer}
					/>
					<SetExpiryDialog
						open={iradiusRowDialog.kind === "set-expiry"}
						onOpenChange={(o) => !o && setIradiusRowDialog(null)}
						organizationId={organizationId}
						customer={iradiusRowDialog.customer}
					/>
				</>
			)}

			{/* Set discount dialog (review-queue inline action) */}
			<Dialog
				open={!!discountDialog}
				onOpenChange={(o) => !o && setDiscountDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Set recurring discount</DialogTitle>
						<DialogDescription>
							{discountDialog?.customerName} — applied to future
							iRadius invoices.
						</DialogDescription>
					</DialogHeader>
					{discountDialog && (
						<div>
							<Label htmlFor="review-discount">
								Discount amount
							</Label>
							<Input
								id="review-discount"
								type="number"
								step="0.01"
								min="0"
								value={discountDialog.discount}
								onChange={(e) =>
									setDiscountDialog({
										...discountDialog,
										discount: e.target.value,
									})
								}
							/>
						</div>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDiscountDialog(null)}
						>
							Cancel
						</Button>
						<Button
							disabled={
								setDiscount.isPending || reviewPayment.isPending
							}
							onClick={async () => {
								if (!organizationId || !discountDialog) {
									return;
								}
								const value = Number.parseFloat(
									discountDialog.discount,
								);
								if (!Number.isFinite(value) || value < 0) {
									toast.error(
										"Discount must be a non-negative number",
									);
									return;
								}
								try {
									await setDiscount.mutateAsync({
										organizationId,
										customerId: discountDialog.customerId,
										discount: value,
									});
									await reviewPayment.mutateAsync({
										organizationId,
										paymentId: discountDialog.paymentId,
									});
									toast.success(
										"Discount applied and payment reviewed",
									);
									setDiscountDialog(null);
								} catch (err) {
									toast.error(
										err instanceof Error
											? err.message
											: "Failed",
									);
								}
							}}
						>
							{setDiscount.isPending ? "Saving…" : "Apply"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function PaymentsListSkeleton() {
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-[88px] rounded-lg" />
				))}
			</div>
			<Skeleton className="h-10 w-full" />
			<div className="rounded-lg border bg-card p-4">
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
	);
}

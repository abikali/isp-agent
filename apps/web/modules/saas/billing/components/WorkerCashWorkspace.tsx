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
import { formatCurrency, formatDateTime } from "@shared/lib/format";
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
} from "@ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import { Toggle } from "@ui/components/toggle";
import { cn } from "@ui/lib";
import {
	BanknoteIcon,
	ChevronRightIcon,
	HandCoinsIcon,
	PhoneIcon,
	RotateCcwIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useCreateCollection,
	useDeleteCollection,
	usePaySalary,
	useWorkerBalance,
	useWorkers,
} from "../hooks/use-billing";

const HANDOFF_SORT_BY_MAP = {
	collectedAt: "collectedAt",
	amount: "amount",
	type: "type",
} as const satisfies Record<string, "collectedAt" | "amount" | "type">;

const PAGE_SIZE = 25;

interface WorkerRow {
	id: string;
	name: string;
	username: string | null;
	phone: string | null;
	customerCount: number;
	inHand: number;
	monthCollected: number;
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase();
}

function slugFor(w: { username: string | null; id: string }): string {
	return w.username ?? w.id;
}

// ─── Hub (picker) ────────────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive workers hub; metrics/filter/list state are tightly coupled
export function WorkersHub() {
	const { data } = useWorkers();
	const workers: WorkerRow[] = useMemo(() => data?.workers ?? [], [data]);
	const { activeOrganization } = useActiveOrganization();
	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}/billing/workers`
		: "";

	const [search, setSearch] = useState("");
	const [withBalanceOnly, setWithBalanceOnly] = useState(false);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		return workers.filter((w) => {
			if (
				term &&
				!`${w.name} ${w.username ?? ""}`.toLowerCase().includes(term)
			) {
				return false;
			}
			if (withBalanceOnly && w.inHand <= 0) {
				return false;
			}
			return true;
		});
	}, [workers, search, withBalanceOnly]);

	const totals = useMemo(() => {
		const sumInHand = workers.reduce((s, w) => s + w.inHand, 0);
		const sumCustomers = workers.reduce((s, w) => s + w.customerCount, 0);
		const sumMonthCollected = workers.reduce(
			(s, w) => s + w.monthCollected,
			0,
		);
		return { sumInHand, sumCustomers, sumMonthCollected };
	}, [workers]);

	const hasActiveFilters = search || withBalanceOnly;

	const columns = useMemo<ColumnDef<WorkerRow, unknown>[]>(
		() => [
			{
				id: "name",
				header: "Worker",
				cell: ({ row }) => {
					const w = row.original;
					return (
						<a
							href={`${basePath}/${slugFor(w)}`}
							className="group flex min-w-0 items-center gap-2.5"
						>
							<Avatar className="size-8 shrink-0">
								<AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
									{getInitials(w.name)}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0">
								<div className="truncate text-sm font-medium leading-tight group-hover:text-primary">
									{w.name}
								</div>
								<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
									{w.username && (
										<span className="truncate">
											@{w.username}
										</span>
									)}
									{w.phone && (
										<>
											<span className="opacity-30">
												·
											</span>
											<PhoneIcon className="size-2.5 shrink-0" />
											<span className="truncate tabular-nums">
												{w.phone}
											</span>
										</>
									)}
								</div>
							</div>
						</a>
					);
				},
			},
			{
				id: "customers",
				header: "Customers",
				meta: { className: "text-right" },
				cell: ({ row }) => (
					<span className="block text-right text-sm tabular-nums">
						{row.original.customerCount}
					</span>
				),
			},
			{
				id: "monthCollected",
				header: "Collected (mo)",
				meta: { className: "text-right" },
				cell: ({ row }) => (
					<span className="block text-right text-sm tabular-nums text-muted-foreground">
						{row.original.monthCollected}
					</span>
				),
			},
			{
				id: "inHand",
				header: "In hand",
				meta: { className: "text-right" },
				cell: ({ row }) => {
					const v = row.original.inHand;
					return (
						<span
							className={cn(
								"block text-right text-sm font-medium tabular-nums",
								v > 0
									? "text-warning"
									: "text-muted-foreground/60",
							)}
						>
							{formatCurrency(v)}
						</span>
					);
				},
			},
			{
				id: "chevron",
				header: "",
				meta: { className: "w-8 text-right" },
				cell: ({ row }) => (
					<a
						href={`${basePath}/${slugFor(row.original)}`}
						aria-label={`Open ${row.original.name}`}
						className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-foreground"
					>
						<ChevronRightIcon className="size-4" />
					</a>
				),
			},
		],
		[basePath],
	);

	return (
		<div className="space-y-6">
			<MetricStrip columns={3}>
				<MetricCard
					label="Cash in field"
					value={formatCurrency(totals.sumInHand)}
					icon={WalletIcon}
					tone={totals.sumInHand > 0 ? "warning" : "default"}
					hint="Held by workers"
				/>
				<MetricCard
					label="Customers covered"
					value={totals.sumCustomers}
					icon={UsersIcon}
					hint={`Across ${workers.length} workers`}
				/>
				<MetricCard
					label="Collected this month"
					value={totals.sumMonthCollected}
					icon={BanknoteIcon}
					hint="Customers paid via workers"
				/>
			</MetricStrip>

			<ContentCard>
				<ContentCardToolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search by name or username..."
						className="w-full sm:max-w-xs"
					/>
					<Toggle
						pressed={withBalanceOnly}
						onPressedChange={setWithBalanceOnly}
						size="sm"
						aria-label="Show workers with cash in hand only"
					>
						<HandCoinsIcon className="size-3.5" />
						With balance
					</Toggle>
					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setSearch("");
								setWithBalanceOnly(false);
							}}
						>
							<RotateCcwIcon className="mr-1 size-3.5" />
							Reset
						</Button>
					)}
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={filtered}
					pageSize={25}
					emptyState={
						<EmptyState
							icon={UsersIcon}
							title={
								workers.length === 0
									? "No workers yet"
									: "No workers match"
							}
							description={
								workers.length === 0
									? "Once you assign workers they'll show up here."
									: "Try clearing your filters."
							}
						/>
					}
				/>
			</ContentCard>
		</div>
	);
}

export function WorkersHubSkeleton() {
	return (
		<div className="space-y-6">
			<MetricStrip columns={3}>
				{Array.from({ length: 3 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>
			<div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
				<div className="border-b border-border bg-surface-subtle/40 px-3 py-2.5 md:px-4">
					<Skeleton className="h-8 w-64" />
				</div>
				<div className="divide-y divide-border">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							key={`row-${i}`}
							className="flex items-center gap-4 px-4 py-3"
						>
							<Skeleton className="size-8 rounded-full" />
							<div className="flex-1 space-y-1.5">
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="h-2.5 w-24" />
							</div>
							<Skeleton className="h-3.5 w-16" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ─── Detail workspace ────────────────────────────────────────────────

interface WorkerCashWorkspaceProps {
	workerId: string;
	workerName: string;
	workerUsername: string | null;
	workerPhone: string | null;
	customerCount: number;
	backTo: string;
}

export function WorkerCashWorkspace({
	workerId,
	workerName,
	workerUsername,
	workerPhone,
	customerCount,
	backTo,
}: WorkerCashWorkspaceProps) {
	const organizationId = useOrganizationId();
	const { data: balanceData, isLoading: balanceLoading } =
		useWorkerBalance(workerId);
	const balance = balanceData?.balance ?? 0;
	const monthAmountCollected = balanceData?.monthAmountCollected ?? 0;
	const salaryPaid = balanceData?.salaryPaidThisMonth ?? 0;

	return (
		<PageShell
			title={workerName}
			backTo={backTo}
			backLabel="Worker Cash"
			subtitle={
				<div className="flex flex-wrap items-center gap-1.5 text-xs">
					<Avatar className="size-5">
						<AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
							{getInitials(workerName)}
						</AvatarFallback>
					</Avatar>
					{workerUsername && (
						<span className="font-medium tabular-nums text-muted-foreground">
							@{workerUsername}
						</span>
					)}
					<span className="opacity-30">·</span>
					<span className="tabular-nums text-muted-foreground">
						{customerCount} customers
					</span>
					{workerPhone && (
						<>
							<span className="opacity-30">·</span>
							<a
								href={`tel:${workerPhone}`}
								className="inline-flex items-center gap-1 tabular-nums text-muted-foreground hover:text-foreground"
							>
								<PhoneIcon className="size-3" />
								{workerPhone}
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
							hint="Cash to collect from him"
						/>
						<MetricCard
							label="Collected"
							value={formatCurrency(monthAmountCollected)}
							icon={BanknoteIcon}
							tone="success"
							hint="This month"
						/>
						<MetricCard
							label="Customers"
							value={customerCount}
							icon={UsersIcon}
							hint="Assigned to him"
						/>
						<MetricCard
							label="Money given"
							value={formatCurrency(salaryPaid)}
							icon={HandCoinsIcon}
							hint="This month"
						/>
					</>
				)}
			</MetricStrip>

			<div className="grid gap-3 lg:grid-cols-3">
				<HandoffCard workerId={workerId} balance={balance} />
				<GiveMoneyCard workerId={workerId} balance={balance} />
			</div>

			<CashHistoryPanel
				workerId={workerId}
				organizationId={organizationId}
			/>
		</PageShell>
	);
}

export function WorkerCashWorkspaceSkeleton() {
	return (
		<div className="space-y-6">
			<MetricStrip columns={4}>
				{Array.from({ length: 4 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>
			<div className="grid gap-3 lg:grid-cols-2">
				<Skeleton className="h-44 rounded-lg" />
				<Skeleton className="h-44 rounded-lg" />
			</div>
			<Skeleton className="h-64 rounded-lg" />
		</div>
	);
}

// ─── Handoff card ────────────────────────────────────────────────────

function HandoffCard({
	workerId,
	balance,
}: {
	workerId: string;
	balance: number;
}) {
	const organizationId = useOrganizationId();
	const createCollection = useCreateCollection();
	const hasBalance = balance > 0;

	const form = useForm({
		defaultValues: { amount: "", notes: "" },
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				createCollection.mutateAsync({
					organizationId,
					collectorId: workerId,
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
			<ContentCardSection className="space-y-3">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<HandCoinsIcon
						className={cn(
							"size-4",
							hasBalance
								? "text-warning"
								: "text-muted-foreground",
						)}
					/>
					Collect cash (handoff)
				</div>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form via oRPC mutation; preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-2.5"
				>
					<form.Field name="amount">
						{(field) => (
							<div className="flex items-center gap-2">
								<Input
									type="number"
									step="0.01"
									min="0.01"
									placeholder="0.00"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									className="h-9 flex-1 tabular-nums"
									required
								/>
								{hasBalance && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-9 shrink-0 text-xs"
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
								className="h-9"
							/>
						)}
					</form.Field>
					<Button
						type="submit"
						className="w-full"
						disabled={isSubmitting}
					>
						<HandCoinsIcon className="mr-1.5 size-4" />
						{isSubmitting ? "Recording…" : "Record handoff"}
					</Button>
				</form>
			</ContentCardSection>
		</ContentCard>
	);
}

// ─── Give money card ─────────────────────────────────────────────────

type CashFrom = "company" | "collected";
type CashTo = "in_hand" | "him";

const FROM_OPTIONS: { value: CashFrom; label: string }[] = [
	{ value: "company", label: "Company cash" },
	{ value: "collected", label: "His collected cash" },
];
const TO_OPTIONS: { value: CashTo; label: string }[] = [
	{ value: "in_hand", label: "His cash in hand (he owes it back)" },
	{ value: "him", label: "Him — his to keep (pay)" },
];

/** Net effect of a from→to move on his cash in hand + the books. */
function cashEffect(from: CashFrom, to: CashTo, amount: number) {
	// Moving his own collected cash into his cash in hand is a no-op.
	const invalid = from === "collected" && to === "in_hand";
	const inHandDelta =
		to === "in_hand" ? amount : from === "collected" ? -amount : 0;
	return { invalid, inHandDelta, isExpense: to === "him" };
}

function GiveMoneyCard({
	workerId,
	balance,
}: {
	workerId: string;
	balance: number;
}) {
	const organizationId = useOrganizationId();
	const paySalary = usePaySalary();

	const form = useForm({
		defaultValues: {
			amount: "",
			notes: "",
			from: "company" as CashFrom,
			to: "in_hand" as CashTo,
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				paySalary.mutateAsync({
					organizationId,
					workerId,
					amount: Number(value.amount),
					notes: value.notes || undefined,
					from: value.from,
					to: value.to,
				}),
				{
					loading: "Recording…",
					success: () => {
						form.reset();
						return "Recorded";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to record",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const from = useStore(form.store, (s) => s.values.from);
	const to = useStore(form.store, (s) => s.values.to);
	const amountStr = useStore(form.store, (s) => s.values.amount);
	const effect = cashEffect(from, to, Number(amountStr) || 0);

	return (
		<ContentCard className="lg:col-span-2">
			<ContentCardSection className="space-y-3">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<BanknoteIcon className="size-4 text-muted-foreground" />
					Give money
				</div>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form via oRPC mutation; preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="grid gap-4 sm:grid-cols-2"
				>
					{/* Inputs */}
					<div className="space-y-2.5">
						<form.Field name="from">
							{(field) => (
								<LabeledSelect
									label="Take from"
									value={field.state.value}
									onChange={(v) =>
										field.handleChange(v as CashFrom)
									}
									options={FROM_OPTIONS}
								/>
							)}
						</form.Field>
						<form.Field name="to">
							{(field) => (
								<LabeledSelect
									label="Goes to"
									value={field.state.value}
									onChange={(v) =>
										field.handleChange(v as CashTo)
									}
									options={TO_OPTIONS}
								/>
							)}
						</form.Field>
						<div className="flex gap-2">
							<form.Field name="amount">
								{(field) => (
									<Input
										type="number"
										step="0.01"
										min="0.01"
										placeholder="0.00"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										className="h-9 w-28 shrink-0 tabular-nums"
										required
									/>
								)}
							</form.Field>
							<form.Field name="notes">
								{(field) => (
									<Input
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="For… (e.g. pay, buy a router)"
										className="h-9 flex-1"
									/>
								)}
							</form.Field>
						</div>
						<Button
							type="submit"
							variant="secondary"
							className="w-full"
							disabled={isSubmitting || effect.invalid}
						>
							<BanknoteIcon className="mr-1.5 size-4" />
							{isSubmitting ? "Recording…" : "Give money"}
						</Button>
					</div>

					{/* Live preview */}
					<GiveMoneyPreview
						balance={balance}
						amount={Number(amountStr) || 0}
						effect={effect}
					/>
				</form>
			</ContentCardSection>
		</ContentCard>
	);
}

function LabeledSelect<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: T;
	onChange: (value: string) => void;
	options: { value: T; label: string }[];
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className="h-9">
				<span className="mr-1 shrink-0 text-xs text-muted-foreground">
					{label}
				</span>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function GiveMoneyPreview({
	balance,
	amount,
	effect,
}: {
	balance: number;
	amount: number;
	effect: { invalid: boolean; inHandDelta: number; isExpense: boolean };
}) {
	const hasAmount = amount > 0;
	const newInHand = balance + effect.inHandDelta;
	const movesInHand = effect.inHandDelta !== 0;

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface-subtle/40 p-3">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				What happens
			</div>

			{effect.invalid ? (
				<p className="text-xs text-warning">
					That's already his cash in hand — pick a different source or
					destination.
				</p>
			) : (
				<>
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">
							His cash in hand
						</div>
						<div className="flex items-center gap-2 text-sm font-medium tabular-nums">
							<span className="text-muted-foreground">
								{formatCurrency(balance)}
							</span>
							<span className="text-muted-foreground/50">→</span>
							<span
								className={cn(
									movesInHand && hasAmount
										? "text-foreground"
										: "text-muted-foreground",
								)}
							>
								{formatCurrency(newInHand)}
							</span>
							{movesInHand && hasAmount ? (
								<span className="text-[11px] font-normal text-muted-foreground">
									{effect.inHandDelta > 0 ? "+" : "−"}
									{formatCurrency(
										Math.abs(effect.inHandDelta),
									)}
								</span>
							) : (
								<span className="text-[11px] font-normal text-muted-foreground">
									no change
								</span>
							)}
						</div>
					</div>

					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">
							Company books
						</div>
						<div className="text-sm font-medium tabular-nums">
							{!hasAmount ? (
								<span className="text-sm font-normal text-muted-foreground">
									—
								</span>
							) : effect.isExpense ? (
								<>
									+{formatCurrency(amount)}{" "}
									<span className="text-[11px] font-normal text-muted-foreground">
										expense
									</span>
								</>
							) : (
								<span className="text-[11px] font-normal text-muted-foreground">
									not an expense (he owes it back)
								</span>
							)}
						</div>
					</div>

					{!hasAmount && (
						<p className="mt-auto text-[11px] text-muted-foreground/70">
							Enter an amount to preview the effect.
						</p>
					)}
				</>
			)}
		</div>
	);
}

// ─── Cash history ────────────────────────────────────────────────────

interface CashRow {
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

function CashHistoryPanel({
	workerId,
	organizationId,
}: {
	workerId: string;
	organizationId: string | null;
}) {
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		HANDOFF_SORT_BY_MAP,
		() => setPage(1),
	);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.billing.collections.list.queryOptions({
					input: {
						organizationId,
						collectorId: workerId,
						page,
						pageSize: PAGE_SIZE,
						sortBy,
						sortOrder,
					},
				})
			: disabledQuery(["billing", "collections", "list", "worker"]),
	);

	const rows = (data?.collections ?? []) as CashRow[];
	const total = data?.total ?? 0;

	const deleteCollection = useDeleteCollection();
	const [pendingDelete, setPendingDelete] = useState<CashRow | null>(null);

	const handleDelete = (row: CashRow) => {
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

	const columns: ColumnDef<CashRow, unknown>[] = [
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
			// Only entries created in this app are deletable. Rows synced from
			// the legacy billing system carry an externalBillingId and re-sync.
			cell: ({ row }) =>
				row.original.externalBillingId === null ? (
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground hover:text-destructive"
						onClick={() => setPendingDelete(row.original)}
						aria-label="Delete entry"
					>
						<RotateCcwIcon className="size-3.5" />
					</Button>
				) : null,
		},
	];

	return (
		<ContentCard>
			<DataTable
				columns={columns}
				data={rows}
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
						icon={WalletIcon}
						title="No cash entries yet"
						description="Handoffs, salaries and approved expenses will appear here."
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
								? "The worker's in-hand balance will jump back up by the handoff amount."
								: pendingDelete?.type === "CASH_FLOAT"
									? "This removes the float. His cash in hand goes back down by the amount."
									: pendingDelete?.type === "SALARY"
										? "This removes his pay and its expense. His cash in hand is unchanged."
										: pendingDelete?.type ===
												"STORE_PURCHASE"
											? "This removes the purchase. His cash in hand goes back up by the amount."
											: "This removes the entry and its linked expense; the worker's balance will adjust accordingly."}
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

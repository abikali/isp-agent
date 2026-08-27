"use client";

import {
	useCreateExpense,
	useCreateReceiptUploadUrl,
} from "@saas/expenses/client";
import { useWorkerOptions } from "@saas/worker-options/client";
import { formatCurrency, formatDate } from "@shared/lib/format";
import {
	buildMonthOptions,
	currentMonthFilter,
	monthRange,
} from "@shared/lib/month-filter";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { Textarea } from "@ui/components/textarea";
import { PlusIcon, ReceiptIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMyExpensesList, useMyStatsQuery } from "../hooks/use-worker";
import { PhotoCaptureInput } from "./PhotoCaptureInput";
import { Pager, SearchBar, SelectControl, StatStrip } from "./WorkerUI";

type WorkerExpense = ReturnType<typeof useMyExpensesList>["expenses"][number];

const STATUS_VARIANTS: Record<string, "info" | "success" | "error"> = {
	PENDING: "info",
	APPROVED: "success",
	REJECTED: "error",
};

const STATUS_LABELS: Record<string, string> = {
	PENDING: "Pending",
	APPROVED: "Approved",
	REJECTED: "Rejected",
};

const STATUS_OPTIONS = [
	{ value: "all", label: "All statuses" },
	{ value: "PENDING", label: "Pending" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "REJECTED", label: "Rejected" },
];
const SORT_OPTIONS = [
	{ value: "newest", label: "Newest first" },
	{ value: "oldest", label: "Oldest first" },
	{ value: "highest", label: "Highest amount" },
	{ value: "lowest", label: "Lowest amount" },
];
const SORT_MAP: Record<
	string,
	{ sortBy: "createdAt" | "amount"; sortOrder: "asc" | "desc" }
> = {
	newest: { sortBy: "createdAt", sortOrder: "desc" },
	oldest: { sortBy: "createdAt", sortOrder: "asc" },
	highest: { sortBy: "amount", sortOrder: "desc" },
	lowest: { sortBy: "amount", sortOrder: "asc" },
};

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field slices (sheet visibility + 4 inputs) plus list filters; a reducer would add ceremony without grouping related transitions
export function WorkerExpenses() {
	const organizationId = useOrganizationId();
	const { stats, isLoading: statsLoading } = useMyStatsQuery();
	const createExpense = useCreateExpense();
	const createUploadUrl = useCreateReceiptUploadUrl();

	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [statusFilter, setStatusFilter] = useState("all");
	const [sort, setSort] = useState("newest");
	// Default to the current month so the list isn't flooded with old expenses;
	// older months stay reachable through this filter. Value format: "YYYY-M".
	const [monthFilter, setMonthFilter] = useState(currentMonthFilter);
	const [page, setPage] = useState(1);

	const monthOptions = useMemo(
		() => [
			{ value: "all", label: "All time" },
			...buildMonthOptions({ currentLabel: "This month" }),
		],
		[],
	);
	const range = monthRange(monthFilter);

	const [showSubmit, setShowSubmit] = useState(false);
	const [amount, setAmount] = useState("");
	// Admin-managed list (Settings → Worker Dropdowns); empty until it loads,
	// so the first option stands in as the default.
	const { options: categoryOptions, labelOf: categoryLabel } =
		useWorkerOptions("EXPENSE_CATEGORY");
	const [pickedCategory, setPickedCategory] = useState("");
	const category = pickedCategory || categoryOptions[0]?.value || "";
	const [note, setNote] = useState("");
	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

	const sortCfg =
		SORT_MAP[sort] ?? ({ sortBy: "createdAt", sortOrder: "desc" } as const);
	const { expenses, totalPages, isLoading, isFetching } = useMyExpensesList({
		search: debouncedSearch || undefined,
		status:
			statusFilter === "all"
				? undefined
				: (statusFilter as "PENDING" | "APPROVED" | "REJECTED"),
		sortBy: sortCfg.sortBy,
		sortOrder: sortCfg.sortOrder,
		...range,
		page,
	});

	function onFilter<T>(setter: (value: T) => void) {
		return (value: T) => {
			setter(value);
			setPage(1);
		};
	}

	const monthExpenses = stats?.expenses;
	const monthTotal =
		(monthExpenses?.approved.amount ?? 0) +
		(monthExpenses?.pending.amount ?? 0) +
		(monthExpenses?.rejected.amount ?? 0);
	const monthCount =
		(monthExpenses?.approved.count ?? 0) +
		(monthExpenses?.pending.count ?? 0) +
		(monthExpenses?.rejected.count ?? 0);
	const statItems = [
		{
			label: "This month",
			value: formatCurrency(monthTotal),
			hint: `${monthCount} item(s)`,
		},
		{
			label: "Approved (mo)",
			value: formatCurrency(monthExpenses?.approved.amount ?? 0),
			hint: `${monthExpenses?.approved.count ?? 0} item(s)`,
		},
		{
			label: "Pending (mo)",
			value: formatCurrency(monthExpenses?.pending.amount ?? 0),
			hint: `${monthExpenses?.pending.count ?? 0} item(s)`,
		},
		{
			label: "Rejected (mo)",
			value: formatCurrency(monthExpenses?.rejected.amount ?? 0),
			hint: `${monthExpenses?.rejected.count ?? 0} item(s)`,
		},
	];

	async function handleSubmit() {
		if (!organizationId || !amount || Number(amount) <= 0) {
			return;
		}
		if (category === "other" && !note.trim()) {
			toast.error("A note is required for 'Other' expenses");
			return;
		}
		try {
			await createExpense.mutateAsync({
				organizationId,
				amount: Number(amount),
				description: note.trim() || categoryLabel(category),
				category,
				receiptUrl: receiptUrl ?? undefined,
			});
			toast.success("Expense submitted for approval");
			setShowSubmit(false);
			setAmount("");
			setNote("");
			setReceiptUrl(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<div className="space-y-3">
			<StatStrip items={statItems} isLoading={statsLoading} />

			<Button className="w-full" onClick={() => setShowSubmit(true)}>
				<PlusIcon className="mr-2 size-4" />
				Submit expense
			</Button>

			<SearchBar
				value={search}
				onChange={onFilter(setSearch)}
				placeholder="Search expenses…"
			/>
			<div className="flex flex-wrap items-center gap-2">
				<SelectControl
					ariaLabel="Filter by status"
					value={statusFilter}
					onChange={onFilter(setStatusFilter)}
					options={STATUS_OPTIONS}
				/>
				<SelectControl
					ariaLabel="Filter by month"
					value={monthFilter}
					onChange={onFilter(setMonthFilter)}
					options={monthOptions}
				/>
				<SelectControl
					ariaLabel="Sort expenses"
					value={sort}
					onChange={onFilter(setSort)}
					options={SORT_OPTIONS}
					className="ml-auto"
				/>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton
							key={`exp-skel-${i}`}
							className="h-16 rounded-lg"
						/>
					))}
				</div>
			) : expenses.length === 0 ? (
				<div className="py-16 text-center">
					<ReceiptIcon className="mx-auto size-10 text-muted-foreground/50" />
					<p className="mt-3 text-sm text-muted-foreground">
						No expenses match your filters.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{expenses.map((expense) => (
						<ExpenseRow
							key={expense.id}
							expense={expense}
							categoryLabel={categoryLabel(expense.category)}
						/>
					))}
				</div>
			)}

			<Pager
				page={page}
				totalPages={totalPages}
				onPageChange={setPage}
				isFetching={isFetching}
			/>

			<Sheet open={showSubmit} onOpenChange={setShowSubmit}>
				<SheetContent
					side="bottom"
					className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0"
				>
					<SheetHeader className="border-b px-4 py-3">
						<SheetTitle>Submit Expense</SheetTitle>
					</SheetHeader>
					<div className="flex-1 space-y-4 px-4 py-4">
						<div className="space-y-1.5">
							<Label htmlFor="expense-amount">Amount ($) *</Label>
							<Input
								id="expense-amount"
								type="number"
								inputMode="decimal"
								min={0}
								step="0.01"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0.00"
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Category</Label>
							<Combobox
								value={category}
								onChange={setPickedCategory}
								searchPlaceholder="Search categories…"
								options={categoryOptions}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="expense-note">
								Note{category === "other" ? " *" : ""}
							</Label>
							<Textarea
								id="expense-note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								rows={2}
								placeholder="What was this for?"
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Receipt photo</Label>
							<PhotoCaptureInput
								value={receiptUrl}
								onChange={setReceiptUrl}
								label="Snap the receipt"
								getUploadUrl={async (file) => {
									if (!organizationId) {
										throw new Error("No organization");
									}
									const result =
										await createUploadUrl.mutateAsync({
											organizationId,
											filename: file.name,
											contentType: file.type,
										});
									return {
										uploadUrl: result.uploadUrl,
										publicUrl: result.publicUrl,
									};
								}}
							/>
						</div>
					</div>
					<SheetFooter className="border-t px-4 py-3">
						<Button
							className="w-full"
							onClick={handleSubmit}
							disabled={
								createExpense.isPending ||
								!amount ||
								Number(amount) <= 0
							}
						>
							{createExpense.isPending
								? "Submitting…"
								: "Submit for approval"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- expense row colocated with its list
function ExpenseRow({
	expense,
	categoryLabel,
}: {
	expense: WorkerExpense;
	categoryLabel: string;
}) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between gap-3 p-4">
				<div className="min-w-0 flex-1 space-y-0.5">
					<p className="font-medium font-mono text-sm tabular-nums">
						{formatCurrency(expense.amount)}
					</p>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{expense.description}
					</p>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
						<span>
							{formatDate(expense.createdAt, {
								day: "numeric",
								month: "short",
								year: "numeric",
							})}
						</span>
						{categoryLabel ? (
							<>
								<span aria-hidden>·</span>
								<span>{categoryLabel}</span>
							</>
						) : null}
						{expense.receiptUrl ? (
							<>
								<span aria-hidden>·</span>
								<span className="inline-flex items-center gap-1">
									<ReceiptIcon className="size-3" />
									Receipt
								</span>
							</>
						) : null}
					</div>
					{expense.status === "REJECTED" && expense.rejectedReason ? (
						<p className="text-destructive text-xs">
							{expense.rejectedReason}
						</p>
					) : null}
				</div>
				<Badge variant={STATUS_VARIANTS[expense.status] ?? "info"}>
					{STATUS_LABELS[expense.status] ??
						expense.status.toLowerCase()}
				</Badge>
			</CardContent>
		</Card>
	);
}

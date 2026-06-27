"use client";

import { EXPENSE_CATEGORIES } from "@saas/expenses";
import {
	useCreateExpense,
	useCreateReceiptUploadUrl,
} from "@saas/expenses/client";
import {
	type DateInput,
	formatCurrency,
	formatDate,
	getBeirutDate,
} from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/components/accordion";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Separator } from "@ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { PlusIcon, ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyExpensesQuery } from "../hooks/use-worker";
import { PhotoCaptureInput } from "./PhotoCaptureInput";

type WorkerExpense = ReturnType<typeof useMyExpensesQuery>["expenses"][number];

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

// Status order + dot colors for the per-month breakdown (matches Badge variants).
const STATUS_BREAKDOWN = [
	{ status: "APPROVED", label: "Approved", dot: "bg-success" },
	{ status: "PENDING", label: "Pending", dot: "bg-blue-500" },
	{ status: "REJECTED", label: "Rejected", dot: "bg-destructive" },
] as const;

/** Ordinal month key in Beirut time, so grouping matches the displayed dates. */
function monthKey(value: DateInput): number {
	const { year, month } = getBeirutDate(value);
	return year * 12 + month;
}

interface MonthBucket {
	key: number;
	label: string;
	expenses: WorkerExpense[];
	total: number;
}

/** Bucket expenses (already newest-first) into months, preserving that order. */
function groupByMonth(expenses: WorkerExpense[]): MonthBucket[] {
	const buckets = new Map<number, MonthBucket>();
	for (const expense of expenses) {
		const key = monthKey(expense.createdAt);
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = {
				key,
				label: formatDate(expense.createdAt, {
					month: "long",
					year: "numeric",
				}),
				expenses: [],
				total: 0,
			};
			buckets.set(key, bucket);
		}
		bucket.expenses.push(expense);
		bucket.total += expense.amount;
	}
	return [...buckets.values()];
}

function statusTotal(expenses: WorkerExpense[], status: string): number {
	return expenses
		.filter((e) => e.status === status)
		.reduce((sum, e) => sum + e.amount, 0);
}

function statusCount(expenses: WorkerExpense[], status: string): number {
	return expenses.filter((e) => e.status === status).length;
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- single-file feature: month breakdown + expense row are local presentational helpers, not shared components
function MonthBreakdown({ expenses }: { expenses: WorkerExpense[] }) {
	return (
		<div className="grid grid-cols-3 gap-2">
			{STATUS_BREAKDOWN.map(({ status, label, dot }) => (
				<div key={status} className="space-y-0.5">
					<div className="flex items-center gap-1.5">
						<span className={cn("size-1.5 rounded-full", dot)} />
						<span className="text-muted-foreground text-xs">
							{label}
						</span>
					</div>
					<p className="font-medium text-sm tabular-nums">
						{formatCurrency(statusTotal(expenses, status))}
					</p>
					<p className="text-[11px] text-muted-foreground">
						{statusCount(expenses, status)} item(s)
					</p>
				</div>
			))}
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- single-file feature: month breakdown + expense row are local presentational helpers, not shared components
function ExpenseRow({ expense }: { expense: WorkerExpense }) {
	const categoryLabel = EXPENSE_CATEGORIES.find(
		(c) => c.value === expense.category,
	)?.label;
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

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field slices (sheet visibility + 4 inputs); a reducer would add ceremony without grouping related transitions
export function WorkerExpenses() {
	const organizationId = useOrganizationId();
	const { expenses, isLoading } = useMyExpensesQuery();
	const createExpense = useCreateExpense();
	const createUploadUrl = useCreateReceiptUploadUrl();

	const [showSubmit, setShowSubmit] = useState(false);
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("toolkit");
	const [note, setNote] = useState("");
	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

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
				description:
					note.trim() ||
					(EXPENSE_CATEGORIES.find((c) => c.value === category)
						?.label ??
						category),
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

	const now = new Date();
	const currentKey = monthKey(now);
	const currentLabel = formatDate(now, { month: "long", year: "numeric" });

	const months = groupByMonth(expenses);
	const currentMonth = months.find((m) => m.key === currentKey);
	const currentExpenses = currentMonth?.expenses ?? [];
	const currentTotal = currentMonth?.total ?? 0;
	const pastMonths = months
		.filter((m) => m.key !== currentKey)
		.sort((a, b) => b.key - a.key);

	return (
		<div className="space-y-4">
			<Button className="w-full" onClick={() => setShowSubmit(true)}>
				<PlusIcon className="mr-2 size-4" />
				Submit expense
			</Button>

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
						No expenses yet.
					</p>
				</div>
			) : (
				<div className="space-y-5">
					{/* Current month — the focus */}
					<section className="space-y-3">
						<Card className="border-primary/20 bg-primary/5">
							<CardContent className="p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
											This month
										</p>
										<p className="font-medium text-sm">
											{currentLabel}
										</p>
									</div>
									<div className="text-right">
										<p className="font-semibold text-2xl tabular-nums">
											{formatCurrency(currentTotal)}
										</p>
										<p className="text-muted-foreground text-xs">
											{currentExpenses.length} expense(s)
										</p>
									</div>
								</div>
								<Separator className="my-3" />
								<MonthBreakdown expenses={currentExpenses} />
							</CardContent>
						</Card>

						{currentExpenses.length === 0 ? (
							<p className="py-4 text-center text-muted-foreground text-sm">
								No expenses this month yet.
							</p>
						) : (
							currentExpenses.map((expense) => (
								<ExpenseRow
									key={expense.id}
									expense={expense}
								/>
							))
						)}
					</section>

					{/* Earlier months — collapsed by default */}
					{pastMonths.length > 0 ? (
						<section className="space-y-2">
							<p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Earlier months
							</p>
							<Accordion
								type="multiple"
								className="overflow-hidden rounded-lg border"
							>
								{pastMonths.map((month) => (
									<AccordionItem
										key={month.key}
										value={String(month.key)}
										className="border-b last:border-b-0"
									>
										<AccordionTrigger className="px-4 py-3 hover:no-underline">
											<div className="flex flex-1 items-center justify-between gap-2 pr-2">
												<span className="font-medium text-sm">
													{month.label}
												</span>
												<span className="text-muted-foreground text-xs tabular-nums">
													{formatCurrency(
														month.total,
													)}{" "}
													· {month.expenses.length}
												</span>
											</div>
										</AccordionTrigger>
										<AccordionContent className="space-y-2 bg-muted/30 px-3 pt-1 pb-3">
											{month.expenses.map((expense) => (
												<ExpenseRow
													key={expense.id}
													expense={expense}
												/>
											))}
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</section>
					) : null}
				</div>
			)}

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
								onChange={setCategory}
								searchPlaceholder="Search categories…"
								options={EXPENSE_CATEGORIES.map((cat) => ({
									value: cat.value,
									label: cat.label,
								}))}
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

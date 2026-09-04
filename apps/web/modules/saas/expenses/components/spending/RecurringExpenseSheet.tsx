"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";
import {
	type RecurringLine,
	useCreateRecurringExpense,
	useFinanceCategories,
	useUpdateRecurringExpense,
} from "../../hooks/use-spending";
import { parseMoney } from "./AddExpenseSheet";

interface RecurringExpenseSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Editing an existing line; omit to create one. Mount with `key`. */
	line?: RecurringLine | null;
	bucketId?: string | null;
}

function ordinal(day: number): string {
	const suffix =
		day % 10 === 1 && day !== 11
			? "st"
			: day % 10 === 2 && day !== 12
				? "nd"
				: day % 10 === 3 && day !== 13
					? "rd"
					: "th";
	return `${day}${suffix}`;
}

/**
 * A cost that comes back every month at the same amount. Once saved, a daily
 * job files it as an approved expense on its day — nobody types it again.
 */
export function RecurringExpenseSheet({
	open,
	onOpenChange,
	line,
	bucketId,
}: RecurringExpenseSheetProps) {
	const organizationId = useOrganizationId();
	const { categories, isLoading } = useFinanceCategories();
	const create = useCreateRecurringExpense();
	const update = useUpdateRecurringExpense();
	const editing = !!line;

	const [amount, setAmount] = useState(line ? String(line.amount) : "");
	const [description, setDescription] = useState(line?.description ?? "");
	const [financeCategoryId, setFinanceCategoryId] = useState(
		line?.financeCategory?.id ?? bucketId ?? "",
	);
	const [dayOfMonth, setDayOfMonth] = useState(String(line?.dayOfMonth ?? 1));
	const [includeCurrentMonth, setIncludeCurrentMonth] = useState(true);

	const parsed = parseMoney(amount);
	const day = Number.parseInt(dayOfMonth, 10);
	const dayOk = Number.isInteger(day) && day >= 1 && day <= 28;
	const bucket = categories.find((c) => c.id === financeCategoryId);
	const busy = create.isPending || update.isPending;
	const canSubmit =
		!!organizationId &&
		parsed > 0 &&
		description.trim().length > 0 &&
		dayOk &&
		!busy;

	async function submit() {
		if (!organizationId || !canSubmit) {
			return;
		}
		try {
			if (line) {
				await update.mutateAsync({
					organizationId,
					id: line.id,
					amount: parsed,
					description: description.trim(),
					financeCategoryId: financeCategoryId || null,
					dayOfMonth: day,
				});
				toast.success("Recurring expense updated.");
			} else {
				const result = await create.mutateAsync({
					organizationId,
					amount: parsed,
					description: description.trim(),
					financeCategoryId: financeCategoryId || null,
					dayOfMonth: day,
					includeCurrentMonth,
				});
				toast.success(
					result.generated
						? `${formatCurrency(parsed)} every month — this month's row is already on the books.`
						: `${formatCurrency(parsed)} every month, starting on the ${ordinal(day)}.`,
				);
			}
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save it",
			);
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
				<SheetHeader className="border-b px-4 py-3 text-left">
					<SheetTitle>
						{editing
							? "Edit monthly expense"
							: "Repeat every month"}
					</SheetTitle>
					<SheetDescription>
						Rent, the upstream link, the maintenance fee — anything
						that costs the same every month. It is filed
						automatically on its day.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
					<div className="space-y-1.5">
						<Label htmlFor="recurring-amount">
							Amount each month
						</Label>
						<Input
							id="recurring-amount"
							inputMode="decimal"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							placeholder="0.00"
							className="font-mono tabular-nums"
							autoFocus={!editing}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="recurring-what">What is it?</Label>
						<Textarea
							id="recurring-what"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							placeholder="e.g. App maintenance — Abiroot"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="recurring-bucket">Bucket</Label>
						<Combobox
							id="recurring-bucket"
							value={financeCategoryId}
							onChange={setFinanceCategoryId}
							options={[
								{ value: "", label: "Needs a bucket" },
								...categories.map((c) => ({
									value: c.id,
									label: c.label,
								})),
							]}
							placeholder={
								isLoading ? "Loading buckets…" : "Pick a bucket"
							}
							searchPlaceholder="Search buckets…"
							emptyText="No bucket matches"
						/>
						{bucket?.hint && (
							<p className="text-xs text-muted-foreground">
								{bucket.hint}
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="recurring-day">Day of the month</Label>
						<Input
							id="recurring-day"
							type="number"
							min={1}
							max={28}
							value={dayOfMonth}
							onChange={(e) => setDayOfMonth(e.target.value)}
							className="w-24 tabular-nums"
						/>
						<p className="text-xs text-muted-foreground">
							1 to 28, so every month has the day.
						</p>
					</div>

					{!editing && (
						<label
							htmlFor="recurring-include-month"
							className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
						>
							<Checkbox
								id="recurring-include-month"
								checked={includeCurrentMonth}
								onCheckedChange={(v) =>
									setIncludeCurrentMonth(v === true)
								}
								className="mt-0.5"
							/>
							<span>
								<span className="font-medium">
									Also add it for this month
								</span>
								<span className="block text-xs text-muted-foreground">
									Otherwise the first row appears next month
									on the {dayOk ? ordinal(day) : "chosen day"}
									.
								</span>
							</span>
						</label>
					)}

					{parsed > 0 && dayOk && (
						<div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
							<span className="font-medium">
								{formatCurrency(parsed)}
							</span>{" "}
							into{" "}
							<span className="font-medium">
								{bucket?.label ?? "Needs a bucket"}
							</span>{" "}
							on the {ordinal(day)} of every month.
						</div>
					)}
				</div>

				<SheetFooter className="border-t px-4 py-3">
					<Button
						className="w-full"
						onClick={submit}
						disabled={!canSubmit}
					>
						{busy
							? "Saving…"
							: editing
								? "Save changes"
								: "Repeat every month"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
